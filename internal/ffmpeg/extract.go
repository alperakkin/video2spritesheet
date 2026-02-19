package ffmpeg

import (
	"fmt"
	"os"
	"path/filepath"
)

func ExtractFrames(input, outDir string, fps int, size int) error {
	if err := os.MkdirAll(outDir, 0755); err != nil {
		return err
	}

	var filter string

	if size > 0 {
		filter = fmt.Sprintf("fps=%d,scale=%d:-1", fps, size)
	} else {
		filter = fmt.Sprintf("fps=%d", fps)
	}

	return Run(
		"-y",
		"-i", input,
		"-vf", filter,
		filepath.Join(outDir, "frame_%04d.png"),
	)
}
