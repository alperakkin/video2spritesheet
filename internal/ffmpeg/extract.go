package ffmpeg

import (
	"os"
	"path/filepath"
)

func ExtractFrames(input, outDir string) error {
	if err := os.MkdirAll(outDir, 0755); err != nil {
		return err
	}
	return Run(
		"-y",
		"-i", input,
		"-vf", "fps=12",
		filepath.Join(outDir, "frame_%04d.png"),
	)
}
