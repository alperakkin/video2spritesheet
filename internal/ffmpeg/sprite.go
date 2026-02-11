package ffmpeg

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func MakeSpriteSheet(framesDir, output, tile string) error {
	// Default to 8x8 if tile is empty
	if tile == "" {
		tile = "8x8"
	}

	// Read all frame files
	entries, err := os.ReadDir(framesDir)
	if err != nil {
		return fmt.Errorf("failed to read frames directory: %w", err)
	}

	// Collect frame file paths, excluding temp files
	var frameFiles []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		filename := entry.Name()
		if strings.HasPrefix(filename, "frame_") && strings.HasSuffix(filename, ".png") && !strings.HasPrefix(filename, "temp_") {
			frameFiles = append(frameFiles, filepath.Join(framesDir, filename))
		}
	}

	if len(frameFiles) == 0 {
		return fmt.Errorf("no frame files found in %s", framesDir)
	}

	// Sort frame files to ensure correct order
	sort.Strings(frameFiles)

	// Use a simpler approach: use pattern_type glob with tile filter
	// This is more efficient and handles many frames better
	args := []string{
		"-y",
		"-pattern_type", "glob",
		"-i", filepath.Join(framesDir, "frame_*.png"),
		"-filter_complex", fmt.Sprintf("tile=%s", tile),
		"-frames:v", "1",
		output,
	}

	return Run(args...)
}
