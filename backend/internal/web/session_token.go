// Modified for Personal File Relay: revocable 90-day browser sign-in (2026-11-05).
package web

import (
	"fmt"
	"github.com/golang-jwt/jwt/v4"
	"time"

	"github.com/gtsteffaniak/filebrowser/backend/internal/auth"
	"github.com/gtsteffaniak/filebrowser/backend/internal/database/users"
	"github.com/gtsteffaniak/filebrowser/backend/internal/state"
	"github.com/gtsteffaniak/filebrowser/backend/internal/utils"
	"github.com/gtsteffaniak/filebrowser/backend/pkg/settings"
	"github.com/gtsteffaniak/go-logger/logger"
)

// mintAndRegisterSessionToken creates a minimal session JWT and registers its hash for auth lookup.
func mintAndRegisterSessionToken(user *users.User) (string, error) {
	return mintRememberedSessionToken(user, "")
}

// Personal File Relay (2026-11-05): bind short sessions to independently revocable devices.
func mintRememberedSessionToken(user *users.User, deviceID string) (string, error) {
	if user == nil || user.ID == 0 {
		return "", fmt.Errorf("invalid user for session token")
	}
	expires := time.Hour * time.Duration(settings.Config.Auth.TokenExpirationHours)
	name := "WEB_TOKEN_" + utils.InsecureRandomIdentifier(4)
	if deviceID != "" && !state.ValidateRememberedDevice(deviceID, user) {
		return "", fmt.Errorf("browser credential revoked")
	}
	tokenString, _, err := auth.MakeSignedTokenAPI(user, name, expires, user.Permissions, true, deviceID)
	if err != nil {
		return "", err
	}
	if err := state.RegisterSessionToken(tokenString, user.ID); err != nil {
		return "", err
	}
	return tokenString, nil
}

// replaceSessionToken mints and registers the replacement before retiring the
// prior token. If minting or registration fails the current session is left
// untouched. The prior token is retired with a grace window (not revoked
// immediately) so requests already in flight with the old cookie stay valid.
func replaceSessionToken(oldToken string, user *users.User) (string, error) {
	deviceID := ""
	if oldToken != "" {
		var claims users.AuthToken
		if _, err := jwt.ParseWithClaims(oldToken, &claims, auth.JWTSigningKeyFunc()); err != nil {
			return "", err
		}
		deviceID = claims.RememberDevice
	}
	newToken, err := mintRememberedSessionToken(user, deviceID)
	if err != nil {
		return "", err
	}
	if oldToken == "" || oldToken == newToken {
		return newToken, nil
	}
	if err := state.RetireSessionToken(oldToken); err != nil {
		if cleanupErr := state.RemoveApiToken(newToken); cleanupErr != nil {
			logger.Errorf("failed to roll back replacement session token: %v", cleanupErr)
		}
		return "", err
	}
	return newToken, nil
}
