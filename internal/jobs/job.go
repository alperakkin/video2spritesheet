package jobs

import (
	"fmt"
	"os"
	"path/filepath"

	"video2spritesheet/internal/ffmpeg"
)

type Params struct {
	Threshold  float64
	Similarity float64
	Tile       string
}

type Job struct {
	ID        string
	Dir       string
	InputPath string
	Params    Params
	Status    Status
}

func NewJob(inputPath string, params Params) *Job {
	id := fmt.Sprintf("job_%d", os.Getpid())
	dir := filepath.Join("outputs", id)

	os.MkdirAll(dir, 0755)

	job := &Job{
		ID:        id,
		Dir:       dir,
		InputPath: inputPath,
	}

	job.InitStatus()
	return job
}

func (j *Job) Process() error {
	frames := filepath.Join(j.Dir, "frames_%03d.png")

	if err := ffmpeg.Run(
		"-y",
		"-i",
		j.InputPath,
		frames,
	); err != nil {
		return err
	}

	return nil
}
