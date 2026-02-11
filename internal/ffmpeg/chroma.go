package ffmpeg

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// hexToFFmpegColor converts hex color (#RRGGBB) to FFmpeg format (0xRRGGBB)
func hexToFFmpegColor(hex string) string {
	// Remove # if present
	hex = strings.TrimPrefix(hex, "#")

	// Ensure it's 6 characters
	if len(hex) == 3 {
		// Expand shorthand (e.g., #f00 -> #ff0000)
		hex = string(hex[0]) + string(hex[0]) + string(hex[1]) + string(hex[1]) + string(hex[2]) + string(hex[2])
	}

	// Convert to uppercase and add 0x prefix
	return "0x" + strings.ToUpper(hex)
}

func Chroma(framesDir, chromaColor string, threshold, similarity float64) error {
	entries, err := os.ReadDir(framesDir)
	if err != nil {
		return err
	}

	// Convert hex color to FFmpeg format
	ffmpegColor := hexToFFmpegColor(chromaColor)

	// Use provided threshold and similarity, or defaults
	// chromakey filter format: chromakey=color:similarity:blend
	// similarity: similarity threshold (0.0-1.0) - how similar the color needs to be
	// blend: blend amount (0.0-1.0) - how much to blend edges
	similarityStr := strconv.FormatFloat(similarity, 'f', 2, 64)
	if similarity == 0 {
		similarityStr = "0.05" // Default similarity threshold
	}
	thresholdStr := strconv.FormatFloat(threshold, 'f', 2, 64)
	if threshold == 0 {
		thresholdStr = "0.15" // Default blend amount
	}

	filter := fmt.Sprintf("chromakey=%s:%s:%s", ffmpegColor, similarityStr, thresholdStr)

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		filename := entry.Name()
		if filepath.Ext(filename) != ".png" {
			continue
		}

		// Skip temp files
		if strings.HasPrefix(filename, "temp_") {
			continue
		}

		inputPath := filepath.Join(framesDir, filename)
		tempPath := filepath.Join(framesDir, "temp_"+filename)

		// Apply chroma key filter
		if err := Run(
			"-y",
			"-i", inputPath,
			"-vf", filter,
			tempPath,
		); err != nil {
			return fmt.Errorf("failed to process %s: %w", filename, err)
		}

		// Replace original with processed
		if err := os.Rename(tempPath, inputPath); err != nil {
			return fmt.Errorf("failed to replace %s: %w", filename, err)
		}
	}

	return nil
}
