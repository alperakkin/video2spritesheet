package api

import (
	"log"
	"net/http"
	"time"

	"video2spritesheet/internal/jobs"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins for this tool; tighten in production if needed
		return true
	},
}

// StatusWSHandler streams live job status updates over WebSocket.
func StatusWSHandler(w http.ResponseWriter, r *http.Request) {
	jobID := r.URL.Query().Get("job_id")
	if jobID == "" {
		http.Error(w, "missing job_id", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			job, ok := jobs.Get(jobID)
			if !ok || job == nil {
				log.Printf("websocket: job %s not found", jobID)
				_ = conn.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, "job not found"))
				return
			}

			status := job.Status
			if err := conn.WriteJSON(status); err != nil {
				log.Printf("websocket write error: %v", err)
				return
			}
		}
	}
}
