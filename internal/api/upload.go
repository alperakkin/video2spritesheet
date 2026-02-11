package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"video2spritesheet/internal/jobs"
	"video2spritesheet/internal/validation"
)

func UploadHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("UPLOAD HIT")
	if err := r.ParseMultipartForm(1 << 30); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	file, header, err := r.FormFile("video")
	if err != nil {
		http.Error(w, "video field missing", 400)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	filename := filepath.Base(header.Filename)
	reader := bytes.NewReader(data)
	if err := validation.ValidateMP4(reader, header.Filename); err != nil {
		http.Error(w, err.Error(), http.StatusUnsupportedMediaType)
		return
	}

	job := jobs.NewJob("", jobs.Params{})

	inputPath := filepath.Join(job.Dir, filename)
	out, err := os.Create(inputPath)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer out.Close()

	out.Write(data)

	job.InputPath = inputPath

	jobs.Store(job)

	resp := map[string]string{
		"job_id":  job.ID,
		"preview": "/outputs/" + job.ID + "/" + filename,
	}

	log.Println("Saved file:", inputPath)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
