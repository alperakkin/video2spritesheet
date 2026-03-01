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

	// Make sure we have enough frames for the tile
	// But FFmpeg will just tile as many as it can if there are fewer

	// We use the image sequence pattern instead of glob to ensure compatibility
	// across all operating systems and FFmpeg builds
	args := []string{
		"-y",
		"-i", filepath.Join(framesDir, "frame_%04d.png"),
		"-filter_complex", fmt.Sprintf("tile=%s", tile),
		"-frames:v", "1",
		output,
	}

	return Run(args...)
}
