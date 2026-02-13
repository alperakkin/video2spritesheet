package ffmpeg

import (
	"fmt"
	"path/filepath"
	"strconv"
)

// MakeGIF creates a transparent GIF from video frames, removing the background
// using the same chroma key parameters as in chroma.go.
func MakeGIF(framesDir, output string, fps int, chromaColor string, threshold, similarity float64) error {
	if fps <= 0 {
		fps = 12
	}

	// Default chroma color if not provided
	if chromaColor == "" {
		chromaColor = "#00ff00"
	}

	// Convert to FFmpeg color format
	ffmpegColor := hexToFFmpegColor(chromaColor)

	// Use provided threshold and similarity, or defaults (same as chroma.go)
	similarityStr := strconv.FormatFloat(similarity, 'f', 2, 64)
	if similarity == 0 {
		similarityStr = "0.05" // Default similarity threshold
	}
	thresholdStr := strconv.FormatFloat(threshold, 'f', 2, 64)
	if threshold == 0 {
		thresholdStr = "0.15" // Default blend amount
	}

	// chromakey=color:similarity:blend
	filter := fmt.Sprintf(
		"chromakey=%s:%s:%s,format=rgba,scale=320:-1:flags=lanczos",
		ffmpegColor,
		similarityStr,
		thresholdStr,
	)

	return Run(
		"-y",
		"-framerate", strconv.Itoa(fps),
		"-i", filepath.Join(framesDir, "frame_%04d.png"),
		"-vf", filter,
		"-gifflags", "+transdiff",
		"-loop", "0",
		output,
	)
}
