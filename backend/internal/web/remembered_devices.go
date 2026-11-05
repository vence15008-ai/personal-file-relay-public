// Personal File Relay addition: optional 90-day browser sign-in (2026-11-05).
package web

import (
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/golang-jwt/jwt/v4"
	"github.com/gtsteffaniak/filebrowser/backend/internal/auth"
	"github.com/gtsteffaniak/filebrowser/backend/internal/database/users"
	storeErrors "github.com/gtsteffaniak/filebrowser/backend/internal/errors"
	"github.com/gtsteffaniak/filebrowser/backend/internal/state"
	"github.com/gtsteffaniak/filebrowser/backend/internal/utils"
	"github.com/gtsteffaniak/filebrowser/backend/pkg/settings"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"
)

const rememberCookieName = "relay_remembered_device"
const rememberLifetime = 90 * 24 * time.Hour

var errRememberedUnauthorized = errors.New("browser credential missing, expired or revoked")

// A custom header requires a same-origin browser request. No CORS permission is granted.
func rememberRequestAllowed(r *http.Request) bool {
	if r.Header.Get("X-Relay-Request") != "1" || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != requestScheme(r)+"://"+requestHost(r) {
		return false
	}
	host := requestHost(r)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	ip := net.ParseIP(strings.Trim(host, "[]"))
	return requestScheme(r) == "https" || (ip != nil && ip.IsLoopback()) || host == "localhost"
}
func setRememberCookie(w http.ResponseWriter, r *http.Request, value string, expires time.Time, maxAge int) {
	http.SetCookie(w, &http.Cookie{Name: rememberCookieName, Value: value, Path: "/", HttpOnly: true, Secure: requestScheme(r) == "https", SameSite: http.SameSiteStrictMode, Expires: expires, MaxAge: maxAge})
	w.Header().Set("Cache-Control", "no-store")
}
func rememberFromCookie(r *http.Request) (state.RememberedDevice, *users.User, error) {
	var empty state.RememberedDevice
	c, err := r.Cookie(rememberCookieName)
	if err != nil {
		return empty, nil, errRememberedUnauthorized
	}
	parts := strings.Split(c.Value, ".")
	if len(parts) != 2 || len(parts[0]) != 32 || len(parts[1]) != 64 {
		return empty, nil, errRememberedUnauthorized
	}
	d, err := state.GetRememberedDevice(parts[0])
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return empty, nil, errRememberedUnauthorized
		}
		return empty, nil, err
	}
	hash := utils.HashSHA256(parts[1])
	if subtle.ConstantTimeCompare([]byte(hash), []byte(d.SecretHash)) != 1 {
		return empty, nil, errRememberedUnauthorized
	}
	user, err := state.GetUserByID(d.UserID)
	if err != nil {
		if errors.Is(err, storeErrors.ErrNotExist) {
			return empty, nil, errRememberedUnauthorized
		}
		return empty, nil, err
	}
	if d.Revoked || d.Expires <= time.Now().Unix() || d.CredentialHash != state.RememberCredentialHash(&user) || user.LoginMethod != users.LoginMethodPassword || user.RequirePasswordChange {
		return empty, nil, errRememberedUnauthorized
	}
	return d, &user, nil
}
func rememberedTokenResponse(w http.ResponseWriter, r *http.Request, user *users.User, id string) (int, error) {
	token, err := mintRememberedSessionToken(user, id)
	if err != nil {
		return http.StatusInternalServerError, fmt.Errorf("could not create session")
	}
	SetSessionCookie(w, r, token, time.Now().Add(time.Duration(settings.Config.Auth.TokenExpirationHours)*time.Hour).Add(sessionCookieBuffer))
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "text/plain")
	_, err = w.Write([]byte(token))
	return 0, err
}

// Called only after the ordinary password/TOTP or password+passkey flow has completed.
func loginTokenResponse(w http.ResponseWriter, r *http.Request, user *users.User) (int, error) {
	if r.Header.Get("X-Remember-Device") != "true" {
		if prior, owner, err := rememberFromCookie(r); err == nil && owner.ID == user.ID {
			if !rememberRequestAllowed(r) {
				return http.StatusForbidden, fmt.Errorf("same-origin request required")
			}
			if err := state.RevokeRememberedDevice(user.ID, prior.ID); err != nil {
				return http.StatusInternalServerError, err
			}
			setRememberCookie(w, r, "", time.Unix(0, 0), -1)
		}
		return printToken(w, r, user, "")
	}
	if !rememberRequestAllowed(r) {
		return http.StatusForbidden, fmt.Errorf("same-origin secure request required")
	}
	if user.LoginMethod != users.LoginMethodPassword || user.RequirePasswordChange {
		return http.StatusForbidden, fmt.Errorf("remembering requires a password account")
	}
	label, err := url.QueryUnescape(r.Header.Get("X-Device-Name"))
	if err != nil {
		return http.StatusBadRequest, fmt.Errorf("invalid device name")
	}
	label = strings.TrimSpace(strings.Map(func(c rune) rune {
		if unicode.IsControl(c) {
			return -1
		}
		return c
	}, label))
	if label == "" {
		label = "个人浏览器"
	}
	if len([]rune(label)) > 60 {
		return http.StatusBadRequest, fmt.Errorf("device name too long")
	}
	id, err := utils.RandomHex(16)
	if err != nil {
		return http.StatusInternalServerError, err
	}
	secret, err := utils.RandomHex(32)
	if err != nil {
		return http.StatusInternalServerError, err
	}
	now := time.Now()
	d := state.RememberedDevice{ID: id, UserID: user.ID, SecretHash: utils.HashSHA256(secret), CredentialHash: state.RememberCredentialHash(user), Label: label, Created: now.Unix(), LastUsed: now.Unix(), Expires: now.Add(rememberLifetime).Unix()}
	if err = state.CreateRememberedDevice(d); err != nil {
		return http.StatusConflict, fmt.Errorf("could not remember browser; revoke an old device and retry")
	}
	// Re-enrollment replaces only this browser's prior registration, after creating the new one.
	if prior, priorUser, e := rememberFromCookie(r); e == nil && priorUser.ID == user.ID {
		_ = state.RevokeRememberedDevice(user.ID, prior.ID)
	}
	setRememberCookie(w, r, id+"."+secret, time.Unix(d.Expires, 0), int(rememberLifetime.Seconds()))
	return rememberedTokenResponse(w, r, user, id)
}
func restoreRememberedHandler(w http.ResponseWriter, r *http.Request, d *Context) (int, error) {
	w.Header().Set("Cache-Control", "no-store")
	if !rememberRequestAllowed(r) {
		return http.StatusForbidden, fmt.Errorf("same-origin secure request required")
	}
	device, user, err := rememberFromCookie(r)
	if err != nil {
		if !errors.Is(err, errRememberedUnauthorized) {
			return http.StatusServiceUnavailable, fmt.Errorf("could not restore session; retry later")
		}
		setRememberCookie(w, r, "", time.Unix(0, 0), -1)
		return http.StatusUnauthorized, fmt.Errorf("browser credential missing, expired or revoked")
	}
	if err = state.TouchRememberedDevice(device.ID); err != nil {
		return http.StatusInternalServerError, fmt.Errorf("could not restore session")
	}
	return rememberedTokenResponse(w, r, user, device.ID)
}
func sessionDeviceID(token string) string {
	var claims users.AuthToken
	if _, err := jwt.ParseWithClaims(token, &claims, auth.JWTSigningKeyFunc(), jwt.WithoutClaimsValidation()); err == nil {
		return claims.RememberDevice
	}
	return ""
}
func listRememberedHandler(w http.ResponseWriter, r *http.Request, d *Context) (int, error) {
	w.Header().Set("Cache-Control", "no-store")
	devices, err := state.ListRememberedDevices(d.User.ID)
	if err != nil {
		return http.StatusInternalServerError, err
	}
	current := sessionDeviceID(d.Token)
	for i := range devices {
		devices[i].Current = devices[i].ID == current
	}
	valid := devices[:0]
	for _, device := range devices {
		if state.ValidateRememberedDevice(device.ID, d.User) {
			valid = append(valid, device)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	return 0, json.NewEncoder(w).Encode(valid)
}
func revokeRememberedHandler(w http.ResponseWriter, r *http.Request, d *Context) (int, error) {
	if !rememberRequestAllowed(r) {
		return http.StatusForbidden, fmt.Errorf("same-origin secure request required")
	}
	id := r.PathValue("id")
	if len(id) != 32 {
		return http.StatusNotFound, nil
	}
	if err := state.RevokeRememberedDevice(d.User.ID, id); err != nil {
		return http.StatusNotFound, nil
	}
	w.Header().Set("Cache-Control", "no-store")
	if id == sessionDeviceID(d.Token) {
		setRememberCookie(w, r, "", time.Unix(0, 0), -1)
		http.SetCookie(w, sessionCookie(r, "", time.Unix(0, 0), -1, http.SameSiteStrictMode))
	}
	return http.StatusNoContent, nil
}
