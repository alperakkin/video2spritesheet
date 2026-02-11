let jobId = null;
let isProcessing = false;
let pollInterval = null;

// Update range value displays
document.getElementById("threshold").addEventListener("input", (e) => {
    document.getElementById("thresholdValue").textContent = e.target.value;
});

document.getElementById("similarity").addEventListener("input", (e) => {
    document.getElementById("similarityValue").textContent = e.target.value;
});

// Update color picker display
document.getElementById("chromaColor").addEventListener("input", (e) => {
    document.getElementById("chromaColorValue").textContent = e.target.value.toUpperCase();
});

// File upload handler
document.getElementById("upload").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const errorMsg = document.getElementById("errorMessage");
    errorMsg.classList.remove("show");

    const generateBtn = document.getElementById("generate");
    generateBtn.disabled = true;
    generateBtn.textContent = "⏳ Uploading...";

    try {
        const data = new FormData();
        data.append("video", file);

        const res = await fetch("/api/upload", {
            method: "POST",
            body: data
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || "Upload failed");
        }

        const json = await res.json();
        jobId = json.job_id;

        const video = document.getElementById("preview");
        video.src = json.preview;
        video.load();

        generateBtn.disabled = false;
        generateBtn.textContent = "🚀 Generate Spritesheet";
    } catch (error) {
        errorMsg.textContent = `Error: ${error.message}`;
        errorMsg.classList.add("show");
        generateBtn.disabled = true;
        generateBtn.textContent = "🚀 Generate Spritesheet";
    }
});

// Generate button handler
document.getElementById("generate").addEventListener("click", async () => {
    if (!jobId || isProcessing) return;

    const errorMsg = document.getElementById("errorMessage");
    errorMsg.classList.remove("show");

    const generateBtn = document.getElementById("generate");
    generateBtn.disabled = true;
    isProcessing = true;

    // Reset results
    document.getElementById("gif").classList.add("hidden");
    document.getElementById("sheet").classList.add("hidden");
    document.getElementById("gifDownload").classList.add("hidden");
    document.getElementById("sheetDownload").classList.add("hidden");
    document.getElementById("gifPlaceholder").textContent = "Processing...";
    document.getElementById("gifPlaceholder").style.display = "block";
    document.getElementById("sheetPlaceholder").textContent = "Processing...";
    document.getElementById("sheetPlaceholder").style.display = "block";

    // Show progress section
    const progressSection = document.getElementById("progressSection");
    progressSection.classList.add("active");

    try {
        const payload = {
            job_id: jobId,
            threshold: parseFloat(document.getElementById("threshold").value),
            similarity: parseFloat(document.getElementById("similarity").value),
            tile: document.getElementById("tile").value,
            chroma_color: document.getElementById("chromaColor").value
        };

        const res = await fetch("/api/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || "Processing failed");
        }

        const json = await res.json();

        // Start polling for status
        pollStatus(jobId);
    } catch (error) {
        errorMsg.textContent = `Error: ${error.message}`;
        errorMsg.classList.add("show");
        generateBtn.disabled = false;
        isProcessing = false;
        progressSection.classList.remove("active");
    }
});

// Poll status function
async function pollStatus(jobId) {
    if (!jobId) return;

    try {
        const res = await fetch(`/outputs/${jobId}/status.json`);
        if (!res.ok) {
            throw new Error("Failed to fetch status");
        }

        const status = await res.json();
        updateProgress(status);
        updateResults(status);

        // Check if processing is complete
        const hasRunning = status.steps && status.steps.some(s => s.status === "running");
        const hasError = status.steps && status.steps.some(s => s.status === "error");
        const allDone = status.steps && status.steps.every(s => s.status === "done" || s.status === "error");

        // Check if outputs are available
        const hasGif = status.outputs && status.outputs.gif;
        const hasSpritesheet = status.outputs && status.outputs.spritesheet;

        if (hasError && !hasRunning) {
            stopPolling();
            document.getElementById("generate").disabled = false;
            isProcessing = false;
            const errorMsg = document.getElementById("errorMessage");
            errorMsg.textContent = "Processing failed. Please try again.";
            errorMsg.classList.add("show");
        } else if (allDone && hasGif && hasSpritesheet) {
            // All steps completed and outputs are available
            // Do one final poll to ensure images are loaded
            setTimeout(() => {
                stopPolling();
                document.getElementById("generate").disabled = false;
                isProcessing = false;
            }, 500);
        } else if (!hasRunning && allDone) {
            // Steps are done but outputs might not be set yet, continue polling briefly
            pollInterval = setTimeout(() => pollStatus(jobId), 500);
        } else {
            // Continue polling
            pollInterval = setTimeout(() => pollStatus(jobId), 1000);
        }
    } catch (error) {
        console.error("Error polling status:", error);
        // Retry after a delay
        pollInterval = setTimeout(() => pollStatus(jobId), 2000);
    }
}

function stopPolling() {
    if (pollInterval) {
        clearTimeout(pollInterval);
        pollInterval = null;
    }
}

// Update progress display
function updateProgress(status) {
    const progressSteps = document.getElementById("progressSteps");
    progressSteps.innerHTML = "";

    if (!status.steps || status.steps.length === 0) {
        return;
    }

    status.steps.forEach(step => {
        const stepDiv = document.createElement("div");
        stepDiv.className = `progress-step ${step.status || step.Status || "pending"}`;

        const stepName = document.createElement("div");
        stepName.className = "step-name";
        stepName.textContent = formatStepName(step.name);

        const stepStatus = document.createElement("div");
        stepStatus.className = `step-status ${step.status || step.Status || "pending"}`;
        stepStatus.textContent = step.status || step.Status || "pending";

        stepDiv.appendChild(stepName);
        stepDiv.appendChild(stepStatus);
        progressSteps.appendChild(stepDiv);
    });
}

// Format step name for display
function formatStepName(name) {
    return name
        .split("_")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

// Update results display
function updateResults(status) {
    if (!status.outputs) return;

    // Update GIF
    if (status.outputs.gif) {
        const gifImg = document.getElementById("gif");
        const gifDownload = document.getElementById("gifDownload");
        const gifPlaceholder = document.getElementById("gifPlaceholder");

        // Convert relative path to absolute URL
        let gifUrl = status.outputs.gif.startsWith("/")
            ? status.outputs.gif
            : "/" + status.outputs.gif;

        // Add cache busting to ensure fresh image
        gifUrl += (gifUrl.includes("?") ? "&" : "?") + "t=" + Date.now();

        // Only update if URL changed to avoid flickering
        const fullGifUrl = window.location.origin + gifUrl;
        if (gifImg.src !== fullGifUrl && !gifImg.src.includes(gifUrl.split("?")[0])) {
            gifImg.onload = () => {
                gifImg.classList.remove("hidden");
                gifDownload.href = gifUrl.split("?")[0]; // Remove cache buster for download
                gifDownload.classList.remove("hidden");
                gifPlaceholder.style.display = "none";
            };
            gifImg.onerror = () => {
                console.error("Failed to load GIF:", gifUrl);
                gifPlaceholder.textContent = "Failed to load GIF. Retrying...";
                gifPlaceholder.style.display = "block";
            };
            gifImg.src = gifUrl;
        } else if (gifImg.complete && gifImg.naturalHeight !== 0) {
            // Image already loaded, just ensure visibility
            gifImg.classList.remove("hidden");
            gifDownload.href = gifUrl.split("?")[0];
            gifDownload.classList.remove("hidden");
            gifPlaceholder.style.display = "none";
        }
    }

    // Update Spritesheet
    if (status.outputs.spritesheet) {
        const sheetImg = document.getElementById("sheet");
        const sheetDownload = document.getElementById("sheetDownload");
        const sheetPlaceholder = document.getElementById("sheetPlaceholder");

        // Convert relative path to absolute URL
        let sheetUrl = status.outputs.spritesheet.startsWith("/")
            ? status.outputs.spritesheet
            : "/" + status.outputs.spritesheet;

        // Add cache busting to ensure fresh image
        sheetUrl += (sheetUrl.includes("?") ? "&" : "?") + "t=" + Date.now();

        // Only update if URL changed to avoid flickering
        const fullSheetUrl = window.location.origin + sheetUrl;
        if (sheetImg.src !== fullSheetUrl && !sheetImg.src.includes(sheetUrl.split("?")[0])) {
            sheetImg.onload = () => {
                sheetImg.classList.remove("hidden");
                sheetDownload.href = sheetUrl.split("?")[0]; // Remove cache buster for download
                sheetDownload.classList.remove("hidden");
                sheetPlaceholder.style.display = "none";
            };
            sheetImg.onerror = () => {
                console.error("Failed to load spritesheet:", sheetUrl);
                sheetPlaceholder.textContent = "Failed to load spritesheet. Retrying...";
                sheetPlaceholder.style.display = "block";
            };
            sheetImg.src = sheetUrl;
        } else if (sheetImg.complete && sheetImg.naturalHeight !== 0) {
            // Image already loaded, just ensure visibility
            sheetImg.classList.remove("hidden");
            sheetDownload.href = sheetUrl.split("?")[0];
            sheetDownload.classList.remove("hidden");
            sheetPlaceholder.style.display = "none";
        }
    }
}
