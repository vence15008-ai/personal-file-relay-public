// Personal File Relay addition: security regression tests (2026-11-05).
package web

import (
	"encoding/json"
	"github.com/gtsteffaniak/filebrowser/backend/internal/database/users"
	"github.com/gtsteffaniak/filebrowser/backend/internal/state"
	"github.com/gtsteffaniak/filebrowser/backend/internal/utils"
	"github.com/gtsteffaniak/filebrowser/backend/pkg/settings"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func rememberTestUser(t *testing.T, name string) *users.User {
	t.Helper()
	oldExpiry := settings.Config.Auth.TokenExpirationHours
	settings.Config.Auth.TokenExpirationHours = 2
	t.Cleanup(func() { settings.Config.Auth.TokenExpirationHours = oldExpiry })
	u := &users.User{FrontendUser: users.FrontendUser{Username: name, LoginMethod: users.LoginMethodPassword, Permissions: users.Permissions{Api: true}}}
	if err := state.CreateUser(u, "synthetic-test-password-90days"); err != nil {
		t.Fatal(err)
	}
	saved, err := state.GetUserByID(u.ID)
	if err != nil {
		t.Fatal(err)
	}
	return &saved
}
func rememberTestLogin(t *testing.T, u *users.User) (*http.Cookie, string) {
	t.Helper()
	req := httptest.NewRequest("POST", "https://relay.example.test/api/auth/login", nil)
	req.Header.Set("X-Remember-Device", "true")
	req.Header.Set("X-Relay-Request", "1")
	req.Header.Set("X-Device-Name", url.QueryEscape("合成测试设备"))
	rec := httptest.NewRecorder()
	status, err := loginTokenResponse(rec, req, u)
	if status != 0 || err != nil {
		t.Fatalf("enroll status %d error %v", status, err)
	}
	var cookie *http.Cookie
	for _, c := range rec.Result().Cookies() {
		if c.Name == rememberCookieName {
			cookie = c
		}
	}
	if cookie == nil {
		t.Fatal("no browser cookie")
	}
	return cookie, rec.Body.String()
}
func rememberRestore(t *testing.T, c *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "https://relay.example.test/api/auth/remember/restore", nil)
	req.Header.Set("X-Relay-Request", "1")
	if c != nil {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	withoutUser(restoreRememberedHandler)(rec, req)
	return rec
}
func TestRememberedBrowserCookieAndRestore(t *testing.T) {
	setupTestEnv(t)
	u := rememberTestUser(t, "remember-owner")
	c, token := rememberTestLogin(t, u)
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteStrictMode || c.Domain != "" || c.MaxAge != 90*86400 || time.Until(c.Expires) < rememberLifetime-time.Minute {
		t.Fatal("unsafe cookie attributes or expiry")
	}
	id := strings.Split(c.Value, ".")[0]
	d, err := state.GetRememberedDevice(id)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(c.Value, d.SecretHash) || d.SecretHash != utils.HashSHA256(strings.Split(c.Value, ".")[1]) {
		t.Fatal("secret must be hash-only in persistence")
	}
	if sessionDeviceID(token) != id {
		t.Fatal("short session lacks signed device binding")
	}
	if rec := rememberRestore(t, c); rec.Code != 200 || sessionDeviceID(rec.Body.String()) != id {
		t.Fatal("valid browser failed to restore")
	}
	if rec := rememberRestore(t, nil); rec.Code != 401 {
		t.Fatal("anonymous restore succeeded")
	}
	forged := *c
	forged.Value = c.Value[:len(c.Value)-2] + "xx"
	if rec := rememberRestore(t, &forged); rec.Code != 401 {
		t.Fatal("forged secret succeeded")
	}
	// Browser cookie itself is not accepted as a file/API bearer token.
	if rec := cookieRequest(t, withUser(mockHandler), c.Value); rec.Code != 401 {
		t.Fatal("long credential granted direct API access")
	}
}
func TestRememberedBrowserIndividualRevocationAndRenewal(t *testing.T) {
	setupTestEnv(t)
	u := rememberTestUser(t, "remember-owner")
	c1, t1 := rememberTestLogin(t, u)
	c2, t2 := rememberTestLogin(t, u)
	replacement, err := replaceSessionToken(t1, u)
	if err != nil {
		t.Fatal(err)
	}
	id1 := sessionDeviceID(t1)
	if sessionDeviceID(replacement) != id1 {
		t.Fatal("renewal dropped revocation binding")
	}
	if err := state.RevokeRememberedDevice(u.ID, id1); err != nil {
		t.Fatal(err)
	}
	for _, token := range []string{t1, replacement} {
		if rec := cookieRequest(t, withUser(mockHandler), token); rec.Code != 401 {
			t.Fatal("revoked short session still works")
		}
	}
	if rec := rememberRestore(t, c1); rec.Code != 401 {
		t.Fatal("revoked browser restored")
	}
	if rec := rememberRestore(t, c2); rec.Code != 200 {
		t.Fatal("unrelated browser lost access")
	}
	if rec := cookieRequest(t, withUser(mockHandler), t2); rec.Code != 200 {
		t.Fatal("unrelated session lost access")
	}
}
func TestRememberedBrowserOwnershipAndNoSecretInList(t *testing.T) {
	setupTestEnv(t)
	u := rememberTestUser(t, "remember-owner")
	other := rememberTestUser(t, "remember-other")
	c, token := rememberTestLogin(t, u)
	_, otherToken := rememberTestLogin(t, other)
	id := sessionDeviceID(token)
	req := httptest.NewRequest("DELETE", "https://relay.example.test/api/auth/remember/devices/"+id, nil)
	req.SetPathValue("id", id)
	req.Header.Set("X-Relay-Request", "1")
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: otherToken})
	rec := httptest.NewRecorder()
	withUser(revokeRememberedHandler)(rec, req)
	if rec.Code != 404 {
		t.Fatal("cross-user revoke allowed")
	}
	if rememberRestore(t, c).Code != 200 {
		t.Fatal("cross-user revoke changed owner device")
	}
	rec = cookieRequest(t, withUser(listRememberedHandler), token)
	var devices []state.RememberedDevice
	if err := json.Unmarshal(rec.Body.Bytes(), &devices); err != nil {
		t.Fatal(err)
	}
	if len(devices) != 1 || !devices[0].Current {
		t.Fatal("list contains other owner or wrong current flag")
	}
	d, _ := state.GetRememberedDevice(id)
	for _, secret := range []string{c.Value, d.SecretHash, d.CredentialHash, otherToken} {
		if strings.Contains(rec.Body.String(), secret) {
			t.Fatal("list leaked credential")
		}
	}
}
func TestRememberedBrowserCSRFAndTransport(t *testing.T) {
	setupTestEnv(t)
	u := rememberTestUser(t, "remember-owner")
	c, _ := rememberTestLogin(t, u)
	for _, test := range []struct{ url, origin, site, header string }{{"https://relay.example.test", "https://evil.example", "cross-site", "1"}, {"https://relay.example.test", "", "", ""}, {"http://relay.example.test", "", "", "1"}} {
		req := httptest.NewRequest("POST", test.url+"/api/auth/remember/restore", nil)
		req.Header.Set("Origin", test.origin)
		req.Header.Set("Sec-Fetch-Site", test.site)
		req.Header.Set("X-Relay-Request", test.header)
		req.AddCookie(c)
		rec := httptest.NewRecorder()
		withoutUser(restoreRememberedHandler)(rec, req)
		if rec.Code != 403 {
			t.Fatal("unsafe request accepted")
		}
	}
}
func TestRememberedBrowserPasswordChangeAndExpiry(t *testing.T) {
	setupTestEnv(t)
	u := rememberTestUser(t, "remember-owner")
	c, token := rememberTestLogin(t, u)
	if err := state.UpdateUser(u, "synthetic-new-password-90days", "password"); err != nil {
		t.Fatal(err)
	}
	if rememberRestore(t, c).Code != 401 || cookieRequest(t, withUser(mockHandler), token).Code != 401 {
		t.Fatal("password change did not invalidate browser and session")
	}
	saved, err := state.GetUserByID(u.ID)
	if err != nil {
		t.Fatal(err)
	}
	d := state.RememberedDevice{ID: strings.Repeat("a", 32), UserID: u.ID, SecretHash: utils.HashSHA256(strings.Repeat("b", 64)), CredentialHash: state.RememberCredentialHash(&saved), Created: time.Now().Add(-rememberLifetime).Unix(), Expires: time.Now().Add(-time.Second).Unix(), Label: "expired"}
	if err := state.CreateRememberedDevice(d); err != nil {
		t.Fatal(err)
	}
	expired := &http.Cookie{Name: rememberCookieName, Value: d.ID + "." + strings.Repeat("b", 64)}
	if rememberRestore(t, expired).Code != 401 {
		t.Fatal("expired browser restored")
	}
}
func TestRememberedBrowserLogoutRevokesAllBoundSessions(t *testing.T) {
	setupTestEnv(t)
	u := rememberTestUser(t, "remember-owner")
	c, token := rememberTestLogin(t, u)
	otherSession := rememberRestore(t, c).Body.String()
	req := httptest.NewRequest("POST", "https://relay.example.test/api/auth/logout", nil)
	req.Header.Set("X-Relay-Request", "1")
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: token})
	// Even a missing long cookie must not leave its registration usable after explicit logout.
	rec := httptest.NewRecorder()
	withOrWithoutUser(logoutHandler)(rec, req)
	if rec.Code != 200 {
		t.Fatalf("logout status %d", rec.Code)
	}
	if rememberRestore(t, c).Code != 401 || cookieRequest(t, withUser(mockHandler), otherSession).Code != 401 {
		t.Fatal("logout left bound browser usable")
	}
}
func TestRememberedBrowserMFAAndRequiredPasswordChange(t *testing.T) {
	setupTestEnv(t)
	u := rememberTestUser(t, "remember-owner")
	u.RequirePasswordChange = true
	req := httptest.NewRequest("POST", "https://relay.example.test/api/auth/login", nil)
	req.Header.Set("X-Remember-Device", "true")
	req.Header.Set("X-Relay-Request", "1")
	rec := httptest.NewRecorder()
	status, _ := loginHandler(rec, req, &Context{User: u})
	if status != 403 || len(rec.Result().Cookies()) != 0 {
		t.Fatal("password-change requirement bypassed")
	}
	u.RequirePasswordChange = false
	oldOTP := settings.Config.Auth.Methods.PasswordAuth.EnforcedOtp
	settings.Config.Auth.Methods.PasswordAuth.EnforcedOtp = true
	t.Cleanup(func() { settings.Config.Auth.Methods.PasswordAuth.EnforcedOtp = oldOTP })
	status, _ = loginHandler(rec, req, &Context{User: u})
	if status != 403 || len(rec.Result().Cookies()) != 0 {
		t.Fatal("OTP requirement bypassed")
	}
}

func TestRememberedBrowserCannotUpgradeShortAdminSession(t *testing.T) {
	setupTestEnv(t)
	u := rememberTestUser(t, "remember-admin")
	u.Permissions.Admin = true
	if err := state.UpdateUser(u, "", "permissions"); err != nil {
		t.Fatal(err)
	}
	short, err := mintAndRegisterSessionToken(u)
	if err != nil {
		t.Fatal(err)
	}
	old := settings.Config.Auth.Methods.PasswordAuth.Enabled
	settings.Config.Auth.Methods.PasswordAuth.Enabled = true
	t.Cleanup(func() { settings.Config.Auth.Methods.PasswordAuth.Enabled = old })
	req := httptest.NewRequest("POST", "https://relay.example.test/api/auth/login?username=remember-admin", nil)
	req.Header.Set("X-Relay-Request", "1")
	req.Header.Set("X-Remember-Device", "true")
	req.Header.Set("X-Password", "wrong-password")
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: short})
	rec := httptest.NewRecorder()
	wrapHandler(loginHelper(loginHandler))(rec, req)
	if rec.Code != 401 || len(rec.Result().Cookies()) != 0 {
		t.Fatal("short admin session upgraded without password")
	}
}
