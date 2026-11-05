package icons

import (
	"github.com/gtsteffaniak/filebrowser/backend/pkg/settings"
	"testing"
)

func TestRelayManifestStartURL(t *testing.T) {
	original := settings.Config.Http.BaseURL
	originalManifest := CachedManifest
	t.Cleanup(func() { settings.Config.Http.BaseURL = original; CachedManifest = originalManifest })
	for _, base := range []string{"/", "/relay/"} {
		settings.Config.Http.BaseURL = base
		InitializePWAManifest()
		if CachedManifest.Name != "中转站" || CachedManifest.StartURL != base+"chat" || CachedManifest.Scope != base || CachedManifest.Display != "standalone" {
			t.Fatalf("unexpected relay manifest: %+v", CachedManifest)
		}
	}
}
