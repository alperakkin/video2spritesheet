let jobId = null;
let isProcessing = false;
let pollInterval = null;
let statusSocket = null;
let editorState = {
    image: null,
    spriteWidth: 64,
    spriteHeight: 64,
    cols: 0,
    rows: 0,
    removed: new Set(),
};

editorState.drag = editorState.drag = {
    active: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
};

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

// Update fps display
document.getElementById("fps").addEventListener("input", (e) => {
    document.getElementById("fpsValue").textContent = e.target.value;
});

// Spritesheet editor controls (if present)
const spriteWidthInput = document.getElementById("spriteWidth");
const spriteHeightInput = document.getElementById("spriteHeight");
const resetEditorBtn = document.getElementById("resetEditor");
const sheetEditorCanvas = document.getElementById("sheetEditorCanvas");
const sheetEditedDownload = document.getElementById("sheetEditedDownload");

if (spriteWidthInput && spriteHeightInput) {
    spriteWidthInput.addEventListener("change", onSpriteSizeChange);
    spriteHeightInput.addEventListener("change", onSpriteSizeChange);
}

if (resetEditorBtn) {
    resetEditorBtn.addEventListener("click", resetEditorSelection);
}

if (sheetEditorCanvas) {
    sheetEditorCanvas.addEventListener("click", onEditorClick);
    sheetEditorCanvas.addEventListener("mousedown", onEditorMouseDown);
    sheetEditorCanvas.addEventListener("mousemove", onEditorMouseMove);
    sheetEditorCanvas.addEventListener("mouseup", onEditorMouseUp);
    sheetEditorCanvas.addEventListener("mouseleave", onEditorMouseUp);
}

if (sheetEditedDownload) {
    sheetEditedDownload.addEventListener("click", (e) => {
        if (!editorState.image) {
            e.preventDefault();
            return;
        }
        const url = exportEditedSpritesheet();
        if (!url) {
            e.preventDefault();
        } else {
            sheetEditedDownload.href = url;
        }
    });
}

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

    // Start live status updates via WebSocket (with HTTP polling fallback)
    // Do this BEFORE triggering processing so we see step transitions in real time.
    connectStatusSocket(jobId);
    // Fallback polling in case WebSocket is not available
    pollStatus(jobId);

    try {
        const payload = {
            job_id: jobId,
            threshold: parseFloat(document.getElementById("threshold").value),
            similarity: parseFloat(document.getElementById("similarity").value),
            tile: document.getElementById("tile").value,
            chroma_color: document.getElementById("chromaColor").value,
            fps: parseInt(document.getElementById("fps").value)
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

// WebSocket live status updates
function connectStatusSocket(jobId) {
    // Close any existing socket
    if (statusSocket) {
        statusSocket.close();
        statusSocket = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/ws/status?job_id=${encodeURIComponent(jobId)}`;

    try {
        statusSocket = new WebSocket(url);
    } catch (err) {
        console.error("WebSocket connection error:", err);
        return;
    }

    statusSocket.onopen = () => {
        console.log("WebSocket connected");
    };

    statusSocket.onmessage = (event) => {
        try {
            const status = JSON.parse(event.data);
            updateProgress(status);
            updateResults(status);
        } catch (err) {
            console.error("Failed to parse WebSocket message:", err);
        }
    };

    statusSocket.onerror = (event) => {
        console.error("WebSocket error:", event);
    };

    statusSocket.onclose = () => {
        console.log("WebSocket closed");
        statusSocket = null;
    };
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

                // Initialize spritesheet editor when spritesheet is ready
                initSpritesheetEditor(sheetUrl);
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

            // Initialize editor if not already
            initSpritesheetEditor(sheetUrl);
        }
    }
}

// ---------- Spritesheet Editor ----------

function initSpritesheetEditor(sheetUrl) {
    const section = document.getElementById("spritesheetEditorSection");
    const canvas = document.getElementById("sheetEditorCanvas");
    if (!section || !canvas) return;

    // Show editor section
    section.classList.remove("hidden");

    const img = new Image();
    img.onload = () => {
        editorState.image = img;

        canvas.width = img.width;
        canvas.height = img.height;

        const sw = parseInt(document.getElementById("spriteWidth").value, 10) || img.width;
        const sh = parseInt(document.getElementById("spriteHeight").value, 10) || img.height;
        editorState.spriteWidth = sw;
        editorState.spriteHeight = sh;
        editorState.cols = Math.floor(img.width / sw);
        editorState.rows = Math.floor(img.height / sh);

        editorState.validWidth = editorState.cols * sw;
        editorState.validHeight = editorState.rows * sh;
        editorState.removed = new Set();

        drawEditor();
    };
    // Use URL without cache-busting query for editor image
    img.src = sheetUrl.split("?")[0];
}
function getCanvasScale(canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
        scaleX: canvas.width / rect.width,
        scaleY: canvas.height / rect.height
    };
}

function drawEditor() {
    const canvas = document.getElementById("sheetEditorCanvas");
    if (!canvas || !editorState.image) return;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(editorState.image, 0, 0);

    // Highlight removed tiles
    ctx.save();
    ctx.fillStyle = "rgba(220,53,69,0.4)";
    editorState.removed.forEach((idx) => {
        const col = idx % editorState.cols;
        const row = Math.floor(idx / editorState.cols);
        ctx.fillRect(
            col * editorState.spriteWidth,
            row * editorState.spriteHeight,
            editorState.spriteWidth,
            editorState.spriteHeight
        );
    });
    ctx.restore();

    // Draw grid
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    for (let x = sw; x <= editorState.validWidth; x += sw) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, editorState.validHeight);
        ctx.stroke();
    }

    for (let y = sh; y <= editorState.validHeight; y += sh) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(editorState.validWidth, y);
        ctx.stroke();
    }
    ctx.restore();

    const removedCount = document.getElementById("removedCount");
    if (removedCount) {
        removedCount.textContent = `Removed: ${editorState.removed.size}`;
    }
}

function onEditorClick(event) {
    const canvas = document.getElementById("sheetEditorCanvas");
    if (!canvas || !editorState.image) return;

    const rect = canvas.getBoundingClientRect();
    const { scaleX, scaleY } = getCanvasScale(canvas);

    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const col = Math.floor(x / editorState.spriteWidth);
    const row = Math.floor(y / editorState.spriteHeight);

    if (x >= editorState.validWidth || y >= editorState.validHeight) return;

    const idx = row * editorState.cols + col;
    if (editorState.removed.has(idx)) {
        editorState.removed.delete(idx);
    } else {
        editorState.removed.add(idx);
    }

    drawEditor();

    const sheetEditedDownload = document.getElementById("sheetEditedDownload");
    if (sheetEditedDownload) {
        sheetEditedDownload.classList.remove("hidden");
    }
}

function getCanvasPoint(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}

function onEditorMouseDown(e) {
    if (!editorState.image) return;

    const canvas = sheetEditorCanvas;
    const p = getCanvasPoint(e, canvas);

    if (p.x >= editorState.validWidth || p.y >= editorState.validHeight) return;

    editorState.drag.active = true;
    editorState.drag.startX = p.x;
    editorState.drag.startY = p.y;
    editorState.drag.endX = p.x;
    editorState.drag.endY = p.y;
}

function onEditorMouseMove(e) {
    if (!editorState.drag.active) return;

    const canvas = sheetEditorCanvas;
    const p = getCanvasPoint(e, canvas);

    editorState.drag.endX = Math.min(p.x, editorState.validWidth);
    editorState.drag.endY = Math.min(p.y, editorState.validHeight);

    drawEditor();
}

function onEditorMouseUp() {
    if (!editorState.drag.active) return;

    const d = editorState.drag;
    editorState.drag.active = false;

    const x1 = Math.min(d.startX, d.endX);
    const y1 = Math.min(d.startY, d.endY);
    const x2 = Math.max(d.startX, d.endX);
    const y2 = Math.max(d.startY, d.endY);

    const sw = editorState.spriteWidth;
    const sh = editorState.spriteHeight;

    const startCol = Math.floor(x1 / sw);
    const endCol = Math.floor((x2 - 1) / sw);
    const startRow = Math.floor(y1 / sh);
    const endRow = Math.floor((y2 - 1) / sh);

    for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
            const idx = row * editorState.cols + col;
            if (editorState.removed.has(idx)) {
                editorState.removed.delete(idx);
            } else {
                editorState.removed.add(idx);
            }
        }
    }

    drawEditor();

    document.getElementById("sheetEditedDownload")?.classList.remove("hidden");
}

// Drag selection box
if (editorState.drag?.active) {
    const d = editorState.drag;
    const x = Math.min(d.startX, d.endX);
    const y = Math.min(d.startY, d.endY);
    const w = Math.abs(d.endX - d.startX);
    const h = Math.abs(d.endY - d.startY);

    ctx.save();
    ctx.strokeStyle = "rgba(0,123,255,0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
}

function onSpriteSizeChange() {
    if (!editorState.image) return;

    const sw = parseInt(document.getElementById("spriteWidth").value, 10) || editorState.image.width;
    const sh = parseInt(document.getElementById("spriteHeight").value, 10) || editorState.image.height;

    editorState.spriteWidth = sw;
    editorState.spriteHeight = sh;
    editorState.cols = Math.max(1, Math.floor(editorState.image.width / sw));
    editorState.rows = Math.max(1, Math.floor(editorState.image.height / sh));
    editorState.removed = new Set();

    drawEditor();
}

function resetEditorSelection() {
    editorState.removed = new Set();
    drawEditor();
}

function exportEditedSpritesheet() {
    if (!editorState.image) return null;

    const offscreen = document.createElement("canvas");
    offscreen.width = editorState.image.width;
    offscreen.height = editorState.image.height;
    const ctx = offscreen.getContext("2d");

    ctx.clearRect(0, 0, offscreen.width, offscreen.height);
    ctx.drawImage(editorState.image, 0, 0);

    // Clear removed tiles (make them fully transparent)
    editorState.removed.forEach((idx) => {
        const col = idx % editorState.cols;
        const row = Math.floor(idx / editorState.cols);
        ctx.clearRect(
            col * editorState.spriteWidth,
            row * editorState.spriteHeight,
            editorState.spriteWidth,
            editorState.spriteHeight
        );
    });

    try {
        return offscreen.toDataURL("image/png");
    } catch (e) {
        console.error("Failed to export edited spritesheet:", e);
        return null;
    }
}
