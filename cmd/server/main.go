package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"video2spritesheet/internal/api"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/upload", api.UploadHandler)
	mux.HandleFunc("/api/process", api.ProcessHandler)
	mux.HandleFunc("/ws/status", api.StatusWSHandler)
	mux.HandleFunc("/outputs/", func(w http.ResponseWriter, r *http.Request) {
		// Detect content type based on file extension
		path := r.URL.Path
		if filepath.Ext(path) == ".gif" {
			w.Header().Set("Content-Type", "image/gif")
		} else if filepath.Ext(path) == ".png" {
			w.Header().Set("Content-Type", "image/png")
		} else if filepath.Ext(path) == ".json" {
			w.Header().Set("Content-Type", "application/json")
		} else if filepath.Ext(path) == ".mp4" {
			w.Header().Set("Content-Type", "video/mp4")
		}
		http.StripPrefix("/outputs/",
			http.FileServer(http.Dir("outputs")),
		).ServeHTTP(w, r)
	})
	mux.Handle("/", http.FileServer(http.Dir("web")))

	// Start background cleanup of old job folders
	go cleanupOldOutputs("outputs", 72*time.Hour)

	log.Println("Server started :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}

// cleanupOldOutputs periodically removes job folders older than maxAge.
// It scans the given root directory every hour.
func cleanupOldOutputs(root string, maxAge time.Duration) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		now := time.Now()

		entries, err := os.ReadDir(root)
		if err != nil {
			if !os.IsNotExist(err) {
				log.Printf("cleanup: failed to read %s: %v", root, err)
			}
		} else {
			for _, entry := range entries {
				if !entry.IsDir() {
					continue
				}

				path := filepath.Join(root, entry.Name())
				info, err := os.Stat(path)
				if err != nil {
					log.Printf("cleanup: stat error for %s: %v", path, err)
					continue
				}

				if now.Sub(info.ModTime()) > maxAge {
					log.Printf("cleanup: removing old job folder %s", path)
					if err := os.RemoveAll(path); err != nil {
						log.Printf("cleanup: failed to remove %s: %v", path, err)
					}
				}
			}
		}

		<-ticker.C
	}
}
