package ffmpeg

import (
	"bytes"
	"os/exec"
)

func Run(args ...string) error {
	cmd := exec.Command("ffmpeg", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		// Return error with stderr for debugging
		return &FFmpegError{
			Err:    err,
			Stderr: stderr.String(),
		}
	}
	return nil
}

type FFmpegError struct {
	Err    error
	Stderr string
}

func (e *FFmpegError) Error() string {
	return e.Err.Error() + ": " + e.Stderr
}
