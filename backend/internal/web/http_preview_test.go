package web

import (
	"errors"
	"image"
	"image/png"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/gtsteffaniak/filebrowser/backend/internal/preview"
	"github.com/gtsteffaniak/filebrowser/backend/pkg/settings"
)

func TestErrToStatusUnsupportedPreviewFormat(t *testing.T) {
	status := ErrToStatus(preview.ErrUnsupportedFormat)
	if status != http.StatusUnsupportedMediaType {
		t.Fatalf("ErrToStatus() = %d, want %d", status, http.StatusUnsupportedMediaType)
	}
}

// Personal File Relay (2026-11-06): compressed size is not decoded image size.
func TestPreviewOriginalRequiresFittingPixelDimensions(t *testing.T) {
	old := settings.Config.Server.DisableResize
	settings.Config.Server.DisableResize = false
	t.Cleanup(func() { settings.Config.Server.DisableResize = old })
	for _, test := range []struct {
		name          string
		width, height int
		fits          bool
	}{{"wide", 2048, 1024, false}, {"small", 64, 64, true}} {
		path := filepath.Join(t.TempDir(), test.name+".png")
		f, err := os.Create(path)
		if err != nil {
			t.Fatal(err)
		}
		if err = png.Encode(f, image.NewGray(image.Rect(0, 0, test.width, test.height))); err != nil {
			f.Close()
			t.Fatal(err)
		}
		if err = f.Close(); err != nil {
			t.Fatal(err)
		}
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if info.Size() >= 256*1024 {
			t.Fatal("fixture should demonstrate small compressed content")
		}
		if got := shouldServeOriginalPreview(".png", true, path, "xlarge", info.Size()); got != test.fits {
			t.Fatalf("%s: original=%v, expected %v", test.name, got, test.fits)
		}
		if shouldServeOriginalPreview(".heic", true, path, "xlarge", info.Size()) {
			t.Fatal("HEIC still requires conversion")
		}
	}
}

func TestErrToStatusWrapsUnsupportedPreviewFormat(t *testing.T) {
	err := errors.Join(errors.New("preview failed"), preview.ErrUnsupportedFormat)
	status := ErrToStatus(err)
	if status != http.StatusUnsupportedMediaType {
		t.Fatalf("ErrToStatus() = %d, want %d", status, http.StatusUnsupportedMediaType)
	}
}
