package jobs

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Step struct {
	Name   string `json:"name"`
	Status string `json:"status"`
}

type Status struct {
	JobID       string            `json:"jobId"`
	CurrentStep string            `json:"currentStep"`
	Steps       []Step            `json:"steps"`
	Outputs     map[string]string `json:"outputs"`
}

func (j *Job) InitStatus() {
	j.Status = Status{
		JobID: j.ID,
		Steps: []Step{
			{"extract_frames", "pending"},
			{"chroma", "pending"},
			{"gif", "pending"},
			{"spritesheet", "pending"},
		},
		Outputs: map[string]string{},
	}

	j.writeStatus()
}

func (j *Job) statusPath() string {
	return filepath.Join(j.Dir, "status.json")
}

func (j *Job) UpdateStep(name, status string) {
	j.Status.CurrentStep = name

	for i := range j.Status.Steps {
		if j.Status.Steps[i].Name == name {
			j.Status.Steps[i].Status = status
		}
	}

	j.writeStatus()
}

func (j *Job) SetOutput(key, value string) {
	j.Status.Outputs[key] = value
	j.writeStatus()
}

func (j *Job) writeStatus() error {
	data, err := json.MarshalIndent(j.Status, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(j.statusPath(), data, 0644)
}

func (j *Job) readStatus() Status {
	data, _ := os.ReadFile(j.statusPath())
	var s Status
	json.Unmarshal(data, &s)
	return s
}
