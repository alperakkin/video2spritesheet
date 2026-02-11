package ffmpeg

import "path/filepath"

func MakeGIF(framesDir, output string) error {
	return Run(
		"-y",
		"-framerate", "12",
		"-i", filepath.Join(framesDir, "frame_%04d.png"),
		"-vf", "scale=320:-1",
		output,
	)
}
