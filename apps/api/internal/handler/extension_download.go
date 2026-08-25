package handler

import (
	"archive/zip"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"

	"github.com/gofiber/fiber/v2"
)

// ExtensionDownloadHandler serves the browser extension as a zip package.
// On each download it checks whether the extension source changed since the
// last zip was built: if so it rebuilds (bun run build) and re-zips first,
// otherwise the existing zip is served directly.
type ExtensionDownloadHandler struct {
	rootDir string
	mu      sync.Mutex // serialize rebuilds so concurrent downloads don't double-build
}

func NewExtensionDownloadHandler() (*ExtensionDownloadHandler, error) {
	wd, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	// API runs from apps/api — repo root is two levels up.
	root := filepath.Clean(filepath.Join(wd, "..", ".."))
	if _, err := os.Stat(filepath.Join(root, "apps", "extension")); err != nil {
		return nil, fmt.Errorf("apps/extension not found under %s: %w", root, err)
	}
	return &ExtensionDownloadHandler{rootDir: root}, nil
}

func (h *ExtensionDownloadHandler) Download(c *fiber.Ctx) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	extDir := filepath.Join(h.rootDir, "apps", "extension")
	zipPath := filepath.Join(extDir, "cphub-extension.zip")

	stale, err := h.isStale(extDir, zipPath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if stale {
		if err := h.rebuild(extDir, zipPath); err != nil {
			log.Printf("[extension] rebuild failed: %v", err)
			return c.Status(fiber.StatusInternalServerError).
				JSON(fiber.Map{"error": "failed to build extension: " + err.Error()})
		}
		log.Printf("[extension] source changed — rebuilt zip: %s", zipPath)
	}

	c.Attachment("cphub-extension.zip")
	return c.SendFile(zipPath)
}

// isStale reports whether the zip is missing or older than any source file.
func (h *ExtensionDownloadHandler) isStale(extDir, zipPath string) (bool, error) {
	zipInfo, err := os.Stat(zipPath)
	if os.IsNotExist(err) {
		return true, nil
	}
	if err != nil {
		return false, err
	}

	// Source files/dirs that affect the build output.
	sources := []string{"src", "public", "manifest.json", "package.json", "vite.config.ts", "tsconfig.json"}
	for _, s := range sources {
		p := filepath.Join(extDir, s)
		info, err := os.Stat(p)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return false, err
		}
		if info.IsDir() {
			stale := false
			err := filepath.WalkDir(p, func(_ string, d os.DirEntry, err error) error {
				if err != nil || stale {
					return err
				}
				if d.Type().IsRegular() {
					if di, err := d.Info(); err == nil && di.ModTime().After(zipInfo.ModTime()) {
						stale = true
					}
				}
				return nil
			})
			if err != nil {
				return false, err
			}
			if stale {
				return true, nil
			}
		} else if info.ModTime().After(zipInfo.ModTime()) {
			return true, nil
		}
	}
	return false, nil
}

// rebuild runs `bun run build` in the extension dir, then zips dist/ into
// zipPath (atomically via a temp file + rename).
func (h *ExtensionDownloadHandler) rebuild(extDir, zipPath string) error {
	bun, err := findBun()
	if err != nil {
		return err
	}

	cmd := exec.Command(bun, "run", "build")
	cmd.Dir = extDir
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("bun run build: %w\n%s", err, out)
	}

	distDir := filepath.Join(extDir, "dist")
	if _, err := os.Stat(distDir); err != nil {
		return fmt.Errorf("dist dir missing after build: %w", err)
	}

	tmpPath := zipPath + ".tmp"
	if err := zipDir(distDir, tmpPath); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return os.Rename(tmpPath, zipPath)
}

// zipDir writes all files under src into a zip archive at dst,
// with paths relative to src.
func zipDir(src, dst string) error {
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	zw := zip.NewWriter(out)
	defer zw.Close()

	return filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		hdr, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		hdr.Name = filepath.ToSlash(rel)
		hdr.Method = zip.Deflate
		w, err := zw.CreateHeader(hdr)
		if err != nil {
			return err
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = io.Copy(w, f)
		return err
	})
}

// findBun locates the bun binary — systemd's PATH doesn't include ~/.bun/bin.
func findBun() (string, error) {
	if p, err := exec.LookPath("bun"); err == nil {
		return p, nil
	}
	if home, err := os.UserHomeDir(); err == nil {
		p := filepath.Join(home, ".bun", "bin", "bun")
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("bun binary not found")
}
