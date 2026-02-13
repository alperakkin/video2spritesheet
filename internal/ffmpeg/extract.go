package ffmpeg

import (
	"fmt"
	"os"
	"path/filepath"
)

func ExtractFrames(input, outDir string, fps int) error {
	if err := os.MkdirAll(outDir, 0755); err != nil {
		return err
	}

	filter := fmt.Sprintf("fps=%d", fps)

	return Run(
		"-y",
		"-i", input,
		"-vf", filter,
		filepath.Join(outDir, "frame_%04d.png"),
	)
}
