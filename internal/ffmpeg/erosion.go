package ffmpeg

import (
	"fmt"
	"os"
	"path/filepath"
)

func Erosion(framesDir, cleanDir string) error {
	if err := os.MkdirAll(cleanDir, 0755); err != nil {
		return err
	}

	entries, err := os.ReadDir(framesDir)
	if err != nil {
		return err
	}

	filter := "format=rgba,erosion"

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		filename := entry.Name()
		if filepath.Ext(filename) != ".png" {
			continue
		}

		inputPath := filepath.Join(framesDir, filename)
		outputPath := filepath.Join(cleanDir, filename)

		if err := Run(
			"-y",
			"-i", inputPath,
			"-vf", filter,
			outputPath,
		); err != nil {
			return fmt.Errorf("erosion failed for %s: %w", filename, err)
		}
	}

	return nil
}
