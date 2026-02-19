package api

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"video2spritesheet/internal/ffmpeg"
	"video2spritesheet/internal/jobs"
)

type ProcessRequest struct {
	JobID       string  `json:"job_id"`
	Threshold   float64 `json:"threshold"`
	Similarity  float64 `json:"similarity"`
	Tile        string  `json:"tile"`
	ChromaColor string  `json:"chroma_color"`
	FPS         int     `json:"fps"`
	Size        int     `json:"size"`
}

func ProcessHandler(w http.ResponseWriter, r *http.Request) {
	var req ProcessRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	job, ok := jobs.Get(req.JobID)
	if !ok || job == nil {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}

	job.InitStatus()

	framesDir := filepath.Join(job.Dir, "frames")
	cleanDir := filepath.Join(job.Dir, "clean")
	gifOut := filepath.Join(job.Dir, "final.gif")
	spriteOut := filepath.Join(job.Dir, "spritesheet.png")

	// Create frames directory
	if err := os.MkdirAll(framesDir, 0755); err != nil {
		log.Printf("Error creating frames directory: %v", err)
		job.UpdateStep("extract_frames", "error")
		http.Error(w, "Failed to create frames directory", http.StatusInternalServerError)
		return
	}

	// 1. Extract frames
	job.UpdateStep("extract_frames", "running")
	if err := ffmpeg.ExtractFrames(job.InputPath, framesDir, req.FPS, req.Size); err != nil {
		log.Printf("Error extracting frames: %v", err)
		job.UpdateStep("extract_frames", "error")
		http.Error(w, "Failed to extract frames", http.StatusInternalServerError)
		return
	}
	job.UpdateStep("extract_frames", "done")

	// 2. Chroma
	job.UpdateStep("chroma", "running")
	chromaColor := req.ChromaColor
	if chromaColor == "" {
		chromaColor = "#00ff00" // Default to green
	}
	if err := ffmpeg.Chroma(framesDir, chromaColor, req.Threshold, req.Similarity); err != nil {
		log.Printf("Error processing chroma: %v", err)
		job.UpdateStep("chroma", "error")
		http.Error(w, "Failed to process chroma", http.StatusInternalServerError)
		return
	}
	job.UpdateStep("chroma", "done")

	// 3. EROSION
	job.UpdateStep("erosion", "running")
	if err := ffmpeg.Erosion(framesDir, cleanDir); err != nil {
		log.Printf("Error processin Erosion: %v", err)
		job.UpdateStep("erosion", "error")
		http.Error(w, "Failed to process erosion", http.StatusInternalServerError)
		return

	}
	job.UpdateStep("erosion", "done")

	// 4. GIF
	job.UpdateStep("gif", "running")
	if err := ffmpeg.MakeGIF(cleanDir, gifOut, req.FPS, chromaColor, req.Threshold, req.Similarity); err != nil {
		log.Printf("Error creating GIF: %v", err)
		job.UpdateStep("gif", "error")
		http.Error(w, "Failed to create GIF", http.StatusInternalServerError)
		return
	}
	job.UpdateStep("gif", "done")
	// Set output path for web access
	job.SetOutput("gif", "/outputs/"+job.ID+"/final.gif")

	// 5. Spritesheet
	job.UpdateStep("spritesheet", "running")
	tile := req.Tile
	if tile == "" {
		tile = "8x8" // Default tile layout
	}
	if err := ffmpeg.MakeSpriteSheet(framesDir, spriteOut, tile); err != nil {
		log.Printf("Error creating spritesheet: %v", err)
		job.UpdateStep("spritesheet", "error")
		http.Error(w, "Failed to create spritesheet", http.StatusInternalServerError)
		return
	}
	job.UpdateStep("spritesheet", "done")
	// Set output path for web access
	job.SetOutput("spritesheet", "/outputs/"+job.ID+"/spritesheet.png")

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(job.Status); err != nil {
		log.Printf("Error encoding response: %v", err)
	}
}
