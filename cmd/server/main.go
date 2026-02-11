package main

import (
	"log"
	"net/http"
	"path/filepath"
	"video2spritesheet/internal/api"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/upload", api.UploadHandler)
	mux.HandleFunc("/api/process", api.ProcessHandler)
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

	log.Println("Server started :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
