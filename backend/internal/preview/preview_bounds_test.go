// Personal File Relay: bound small compressed and previously cached images (2026-11-06).
package preview

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"github.com/gtsteffaniak/filebrowser/backend/pkg/indexing/iteminfo"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestPreviewPixelBoundsIncludeSmallCompressedAndCachedImages(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "synthetic-wide.png")
	var input bytes.Buffer
	if err := png.Encode(&input, image.NewGray(image.Rect(0, 0, 3264, 2448))); err != nil {
		t.Fatal(err)
	}
	if input.Len() >= 256*1024 {
		t.Fatal("fixture must be small compressed content")
	}
	if err := os.WriteFile(path, input.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	stat, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	file := iteminfo.ExtendedFileInfo{FileInfo: iteminfo.FileInfo{ItemInfo: iteminfo.ItemInfo{Name: "synthetic-wide.png", Type: "image/png", Size: stat.Size(), ModTime: stat.ModTime(), HasPreview: true}}, RealPath: path}
	svc := NewPreviewGenerator(1, dir)
	assertBounds := func(data []byte) {
		t.Helper()
		cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		if cfg.Width > 1024 || cfg.Height > 1024 {
			t.Fatalf("oversized preview %dx%d", cfg.Width, cfg.Height)
		}
	}
	output, err := svc.generateImagePreview(context.Background(), file, "xlarge")
	if err != nil {
		t.Fatal(err)
	}
	assertBounds(output)
	oldService := service
	service = svc
	t.Cleanup(func() { service = oldService })
	hasher := md5.New()
	fmt.Fprintf(hasher, "%s:%d:%s", file.RealPath, file.Size, file.ModTime.Format(time.RFC3339Nano))
	cacheKey := CacheKey(hex.EncodeToString(hasher.Sum(nil)), "xlarge", 0)
	if err := svc.fileCache.Store(context.Background(), cacheKey, input.Bytes()); err != nil {
		t.Fatal(err)
	}
	output, err = GetPreviewForFile(context.Background(), file, "xlarge", "", 0)
	if err != nil {
		t.Fatal(err)
	}
	assertBounds(output)
	cached, found, err := svc.fileCache.Load(context.Background(), cacheKey)
	if err != nil || !found {
		t.Fatal("regenerated cache missing")
	}
	assertBounds(cached)
}
