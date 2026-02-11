package jobs

import "sync"

var (
	mu   sync.Mutex
	jobs = map[string]*Job{}
)

func Store(job *Job) {
	mu.Lock()
	defer mu.Unlock()
	jobs[job.ID] = job
}

func Get(id string) (*Job, bool) {
	mu.Lock()
	defer mu.Unlock()
	j, ok := jobs[id]
	return j, ok
}
