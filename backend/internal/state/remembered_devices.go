// Personal File Relay addition: revocable browser credentials (2026-11-05).
package state

import (
	"database/sql"
	"fmt"
	"github.com/gtsteffaniak/filebrowser/backend/internal/database/users"
	"github.com/gtsteffaniak/filebrowser/backend/internal/utils"
	"strconv"
	"time"
)

type RememberedDevice struct {
	ID             string `json:"id"`
	UserID         uint64 `json:"-"`
	SecretHash     string `json:"-"`
	CredentialHash string `json:"-"`
	Label          string `json:"label"`
	Created        int64  `json:"created"`
	Expires        int64  `json:"expires"`
	LastUsed       int64  `json:"lastUsed"`
	Current        bool   `json:"current"`
	Revoked        bool   `json:"-"`
}

func RememberCredentialHash(user *users.User) string {
	return utils.HashSHA256(fmt.Sprintf("%s\x00%s\x00%s\x00%t", user.Password, user.TOTPSecret, user.LoginMethod, user.HasPasskeyMFA()))
}
func CreateRememberedDevice(d RememberedDevice) error {
	if sqlDb == nil {
		return fmt.Errorf("database unavailable")
	}
	var count int
	if err := sqlDb.DB().QueryRow("SELECT count(*) FROM relay_remembered_devices WHERE user_id=? AND revoked=0 AND expires>?", strconv.FormatUint(d.UserID, 10), time.Now().Unix()).Scan(&count); err != nil {
		return err
	}
	if count >= 50 {
		return fmt.Errorf("remembered device limit reached; revoke an old device first")
	}
	_, err := sqlDb.DB().Exec("INSERT INTO relay_remembered_devices(id,user_id,secret_hash,credential_hash,label,created,expires,last_used,revoked) VALUES(?,?,?,?,?,?,?,?,0)", d.ID, strconv.FormatUint(d.UserID, 10), d.SecretHash, d.CredentialHash, d.Label, d.Created, d.Expires, d.LastUsed)
	return err
}
func GetRememberedDevice(id string) (RememberedDevice, error) {
	var d RememberedDevice
	if sqlDb == nil {
		return d, fmt.Errorf("database unavailable")
	}
	err := sqlDb.DB().QueryRow("SELECT id,user_id,secret_hash,credential_hash,label,created,expires,last_used,revoked FROM relay_remembered_devices WHERE id=?", id).Scan(&d.ID, &d.UserID, &d.SecretHash, &d.CredentialHash, &d.Label, &d.Created, &d.Expires, &d.LastUsed, &d.Revoked)
	return d, err
}
func ListRememberedDevices(userID uint64) ([]RememberedDevice, error) {
	rows, err := sqlDb.DB().Query("SELECT id,label,created,expires,last_used FROM relay_remembered_devices WHERE user_id=? AND revoked=0 AND expires>? ORDER BY created DESC", strconv.FormatUint(userID, 10), time.Now().Unix())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []RememberedDevice{}
	for rows.Next() {
		var d RememberedDevice
		if err := rows.Scan(&d.ID, &d.Label, &d.Created, &d.Expires, &d.LastUsed); err != nil {
			return nil, err
		}
		result = append(result, d)
	}
	return result, rows.Err()
}
func RevokeRememberedDevice(userID uint64, id string) error {
	result, err := sqlDb.DB().Exec("UPDATE relay_remembered_devices SET revoked=1 WHERE user_id=? AND id=?", strconv.FormatUint(userID, 10), id)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
func TouchRememberedDevice(id string) error {
	_, err := sqlDb.DB().Exec("UPDATE relay_remembered_devices SET last_used=? WHERE id=? AND last_used<?", time.Now().Unix(), id, time.Now().Add(-time.Minute).Unix())
	return err
}
func ValidateRememberedDevice(id string, user *users.User) bool {
	d, err := GetRememberedDevice(id)
	return err == nil && !d.Revoked && d.UserID == user.ID && d.Expires > time.Now().Unix() && d.CredentialHash == RememberCredentialHash(user) && user.LoginMethod == users.LoginMethodPassword && !user.RequirePasswordChange
}
