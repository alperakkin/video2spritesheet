package validation

import (
	"errors"
	"io"
	"net/http"
	"strings"
)

var (
	ErrNotMP4      = errors.New("only mp4 videos are allowed")
	ErrInvalidMime = errors.New("invalis video mime type")
)

func ValidateMP4(file io.ReadSeeker, filename string) error {
	// extension check
	if !strings.HasSuffix(strings.ToLower(filename), ".mp4") {
		return ErrNotMP4
	}

	// mime check
	buf := make([]byte, 512)
	_, err := file.Read(buf)
	if err != nil {
		return err
	}

	mime := http.DetectContentType(buf)
	file.Seek(0, io.SeekStart)

	if mime != "video/mp4" {
		return ErrInvalidMime
	}

	return nil
}
