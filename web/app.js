let jobId = null;
let isProcessing = false;
let pollInterval = null;
let statusSocket = null;

// ---------- UI Binding ----------

bindRangeDisplay("threshold", "thresholdValue");
bindRangeDisplay("similarity", "similarityValue");
bindRangeDisplay("fps", "fpsValue");

const chromaColorInput = document.getElementById("chromaColor");
if (chromaColorInput) {
    chromaColorInput.addEventListener("input", (e) => {
        document.getElementById("chromaColorValue").textContent = e.target.value.toUpperCase();
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

    resetResultCards();

    const progressSection = document.getElementById("progressSection");
    progressSection.classList.add("active");

    connectStatusSocket(jobId);
    pollStatus(jobId);

    try {
        const payload = {
            job_id: jobId,
            threshold: parseFloat(document.getElementById("threshold").value),
            similarity: parseFloat(document.getElementById("similarity").value),
            tile: document.getElementById("tile").value,
            chroma_color: document.getElementById("chromaColor").value,
            fps: parseInt(document.getElementById("fps").value, 10)
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

        await res.json();
    } catch (error) {
        errorMsg.textContent = `Error: ${error.message}`;
        errorMsg.classList.add("show");
        generateBtn.disabled = false;
        isProcessing = false;
        progressSection.classList.remove("active");
    }
});

async function pollStatus(currentJobId) {
    if (!currentJobId) return;

    try {
        const res = await fetch(`/outputs/${currentJobId}/status.json`);
        if (!res.ok) {
            throw new Error("Failed to fetch status");
        }

        const status = await res.json();
        updateProgress(status);
        updateResults(status);

        const hasRunning = status.steps && status.steps.some((s) => s.status === "running");
        const hasError = status.steps && status.steps.some((s) => s.status === "error");
        const allDone = status.steps && status.steps.every((s) => s.status === "done" || s.status === "error");

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
            setTimeout(() => {
                stopPolling();
                document.getElementById("generate").disabled = false;
                isProcessing = false;
            }, 500);
        } else if (!hasRunning && allDone) {
            pollInterval = setTimeout(() => pollStatus(currentJobId), 500);
        } else {
            pollInterval = setTimeout(() => pollStatus(currentJobId), 1000);
        }
    } catch (error) {
        console.error("Error polling status:", error);
        pollInterval = setTimeout(() => pollStatus(currentJobId), 2000);
    }
}

function connectStatusSocket(currentJobId) {
    if (statusSocket) {
        statusSocket.close();
        statusSocket = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/ws/status?job_id=${encodeURIComponent(currentJobId)}`;

    try {
        statusSocket = new WebSocket(url);
    } catch (err) {
        console.error("WebSocket connection error:", err);
        return;
    }

    statusSocket.onmessage = (event) => {
        try {
            const status = JSON.parse(event.data);
            updateProgress(status);
            updateResults(status);
        } catch (err) {
            console.error("Failed to parse WebSocket message:", err);
        }
    };

    statusSocket.onclose = () => {
        statusSocket = null;
    };
}

function stopPolling() {
    if (pollInterval) {
        clearTimeout(pollInterval);
        pollInterval = null;
    }
}

function updateProgress(status) {
    const progressSteps = document.getElementById("progressSteps");
    progressSteps.innerHTML = "";

    if (!status.steps || status.steps.length === 0) return;

    status.steps.forEach((step) => {
        const normalizedStatus = step.status || step.Status || "pending";

        const stepDiv = document.createElement("div");
        stepDiv.className = `progress-step ${normalizedStatus}`;

        const stepName = document.createElement("div");
        stepName.className = "step-name";
        stepName.textContent = formatStepName(step.name);

        const stepStatus = document.createElement("div");
        stepStatus.className = `step-status ${normalizedStatus}`;
        stepStatus.textContent = normalizedStatus;

        stepDiv.appendChild(stepName);
        stepDiv.appendChild(stepStatus);
        progressSteps.appendChild(stepDiv);
    });
}

function formatStepName(name) {
    return name
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

function updateResults(status) {
    if (!status.outputs) return;

    if (status.outputs.gif) {
        updateImageCard({
            imageEl: document.getElementById("gif"),
            downloadEl: document.getElementById("gifDownload"),
            placeholderEl: document.getElementById("gifPlaceholder"),
            outputPath: status.outputs.gif,
            loadErrorText: "Failed to load GIF. Retrying..."
        });
    }

    if (status.outputs.spritesheet) {
        const spritesheetEditor = new SpritesheetSelectionEditor({
            section: document.getElementById("spritesheetEditorSection"),
            canvas: document.getElementById("sheetEditorCanvas"),
            spriteWidthInput: document.getElementById("spriteWidth"),
            spriteHeightInput: document.getElementById("spriteHeight"),
            resetButton: document.getElementById("resetEditor"),
            removedCount: document.getElementById("removedCount"),
            downloadLink: document.getElementById("sheetEditedDownload")
        });
        updateImageCard({
            imageEl: document.getElementById("sheet"),
            downloadEl: document.getElementById("sheetDownload"),
            placeholderEl: document.getElementById("sheetPlaceholder"),
            outputPath: status.outputs.spritesheet,
            loadErrorText: "Failed to load spritesheet. Retrying...",
            onLoaded: (cleanUrl) => spritesheetEditor.load(cleanUrl)
        });
    }
}

function updateImageCard({ imageEl, downloadEl, placeholderEl, outputPath, loadErrorText, onLoaded }) {
    let url = outputPath.startsWith("/") ? outputPath : `/${outputPath}`;
    const cleanUrl = url;
    url += (url.includes("?") ? "&" : "?") + "t=" + Date.now();

    const fullUrl = window.location.origin + url;
    if (imageEl.src !== fullUrl && !imageEl.src.includes(cleanUrl)) {
        imageEl.onload = () => {
            imageEl.classList.remove("hidden");
            downloadEl.href = cleanUrl;
            downloadEl.classList.remove("hidden");
            placeholderEl.style.display = "none";
            if (onLoaded) onLoaded(cleanUrl);
        };
        imageEl.onerror = () => {
            placeholderEl.textContent = loadErrorText;
            placeholderEl.style.display = "block";
        };
        imageEl.src = url;
        return;
    }

    if (imageEl.complete && imageEl.naturalHeight !== 0) {
        imageEl.classList.remove("hidden");
        downloadEl.href = cleanUrl;
        downloadEl.classList.remove("hidden");
        placeholderEl.style.display = "none";
        if (onLoaded) onLoaded(cleanUrl);
    }
}

function bindRangeDisplay(inputId, outputId) {
    const input = document.getElementById(inputId);
    const output = document.getElementById(outputId);
    if (!input || !output) return;

    input.addEventListener("input", (e) => {
        output.textContent = e.target.value;
    });
}

function resetResultCards() {
    document.getElementById("gif").classList.add("hidden");
    document.getElementById("sheet").classList.add("hidden");
    document.getElementById("gifDownload").classList.add("hidden");
    document.getElementById("sheetDownload").classList.add("hidden");
    document.getElementById("gifPlaceholder").textContent = "Processing...";
    document.getElementById("gifPlaceholder").style.display = "block";
    document.getElementById("sheetPlaceholder").textContent = "Processing...";
    document.getElementById("sheetPlaceholder").style.display = "block";
}

// ---------- Spritesheet Selection Architecture ----------

class SpritesheetSelectionEditor {
    constructor(elements) {
        this.section = elements.section;
        this.canvas = elements.canvas;
        this.spriteWidthInput = elements.spriteWidthInput;
        this.spriteHeightInput = elements.spriteHeightInput;
        this.resetButton = elements.resetButton;
        this.removedCount = elements.removedCount;
        this.downloadLink = elements.downloadLink;

        this.state = {
            image: null,
            spriteWidth: 64,
            spriteHeight: 64,
            cols: 0,
            rows: 0,
            validWidth: 0,
            validHeight: 0,
            removed: new Set(),
            drag: {
                active: false,
                startX: 0,
                startY: 0,
                endX: 0,
                endY: 0
            }
        };

        this.bindEvents();
    }

    bindEvents() {
        if (this.spriteWidthInput) this.spriteWidthInput.addEventListener("change", () => this.onSpriteSizeChange());
        if (this.spriteHeightInput) this.spriteHeightInput.addEventListener("change", () => this.onSpriteSizeChange());
        if (this.resetButton) this.resetButton.addEventListener("click", () => this.resetSelection());

        if (this.canvas) {
            this.canvas.addEventListener("click", (e) => this.onClick(e));
            this.canvas.addEventListener("mousedown", (e) => this.onMouseDown(e));
            this.canvas.addEventListener("mousemove", (e) => this.onMouseMove(e));
            this.canvas.addEventListener("mouseup", () => this.onMouseUp());
            this.canvas.addEventListener("mouseleave", () => this.onMouseUp());
        }

        if (this.downloadLink) {
            this.downloadLink.addEventListener("click", (e) => {
                const url = this.export();
                if (!url) {
                    e.preventDefault();
                    return;
                }
                this.downloadLink.href = url;
            });
        }
    }

    load(sheetUrl) {
        if (!this.section || !this.canvas) return;

        this.section.classList.remove("hidden");

        const img = new Image();
        img.onload = () => {
            this.state.image = img;
            this.canvas.width = img.width;
            this.canvas.height = img.height;

            this.state.spriteWidth = parseInt(this.spriteWidthInput?.value, 10) || img.width;
            this.state.spriteHeight = parseInt(this.spriteHeightInput?.value, 10) || img.height;
            this.recalculateGrid();
            this.state.removed = new Set();
            this.draw();
        };
        img.src = sheetUrl;
    }

    recalculateGrid() {
        const { image, spriteWidth, spriteHeight } = this.state;
        this.state.cols = Math.max(1, Math.floor(image.width / spriteWidth));
        this.state.rows = Math.max(1, Math.floor(image.height / spriteHeight));
        this.state.validWidth = this.state.cols * spriteWidth;
        this.state.validHeight = this.state.rows * spriteHeight;
    }

    draw() {
        if (!this.canvas || !this.state.image) return;
        const ctx = this.canvas.getContext("2d");
        const { image, spriteWidth, spriteHeight, removed, cols, validWidth, validHeight, drag } = this.state;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.drawImage(image, 0, 0);

        ctx.save();
        ctx.fillStyle = "rgba(220,53,69,0.4)";
        removed.forEach((idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            ctx.fillRect(col * spriteWidth, row * spriteHeight, spriteWidth, spriteHeight);
        });
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        for (let x = spriteWidth; x <= validWidth; x += spriteWidth) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, validHeight);
            ctx.stroke();
        }
        for (let y = spriteHeight; y <= validHeight; y += spriteHeight) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(validWidth, y);
            ctx.stroke();
        }
        ctx.restore();

        if (drag.active) {
            const x = Math.min(drag.startX, drag.endX);
            const y = Math.min(drag.startY, drag.endY);
            const w = Math.abs(drag.endX - drag.startX);
            const h = Math.abs(drag.endY - drag.startY);

            ctx.save();
            ctx.strokeStyle = "rgba(0,123,255,0.9)";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(x, y, w, h);
            ctx.restore();
        }

        if (this.removedCount) this.removedCount.textContent = `Removed: ${removed.size}`;
    }

    onClick(event) {
        if (!this.state.image) return;
        const p = this.getCanvasPoint(event);
        if (!this.isPointInGrid(p.x, p.y)) return;

        const idx = this.getTileIndex(p.x, p.y);
        this.toggleTile(idx);
    }

    onMouseDown(event) {
        if (!this.state.image) return;
        const p = this.getCanvasPoint(event);
        if (!this.isPointInGrid(p.x, p.y)) return;

        const { drag } = this.state;
        drag.active = true;
        drag.startX = p.x;
        drag.startY = p.y;
        drag.endX = p.x;
        drag.endY = p.y;
    }

    onMouseMove(event) {
        if (!this.state.drag.active) return;
        const p = this.getCanvasPoint(event);
        this.state.drag.endX = Math.min(p.x, this.state.validWidth);
        this.state.drag.endY = Math.min(p.y, this.state.validHeight);
        this.draw();
    }

    onMouseUp() {
        const { drag, spriteWidth, spriteHeight, cols, removed } = this.state;
        if (!drag.active) return;
        drag.active = false;

        const x1 = Math.min(drag.startX, drag.endX);
        const y1 = Math.min(drag.startY, drag.endY);
        const x2 = Math.max(drag.startX, drag.endX);
        const y2 = Math.max(drag.startY, drag.endY);

        const startCol = Math.floor(x1 / spriteWidth);
        const endCol = Math.floor((x2 - 1) / spriteWidth);
        const startRow = Math.floor(y1 / spriteHeight);
        const endRow = Math.floor((y2 - 1) / spriteHeight);

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const idx = row * cols + col;
                if (removed.has(idx)) removed.delete(idx);
                else removed.add(idx);
            }
        }

        this.afterSelectionUpdated();
    }

    onSpriteSizeChange() {
        if (!this.state.image) return;

        this.state.spriteWidth = parseInt(this.spriteWidthInput?.value, 10) || this.state.image.width;
        this.state.spriteHeight = parseInt(this.spriteHeightInput?.value, 10) || this.state.image.height;
        this.recalculateGrid();
        this.state.removed = new Set();
        this.draw();
    }

    resetSelection() {
        this.state.removed = new Set();
        this.draw();
    }

    export() {
        if (!this.state.image) return null;

        const offscreen = document.createElement("canvas");
        offscreen.width = this.state.image.width;
        offscreen.height = this.state.image.height;

        const ctx = offscreen.getContext("2d");
        ctx.drawImage(this.state.image, 0, 0);

        this.state.removed.forEach((idx) => {
            const col = idx % this.state.cols;
            const row = Math.floor(idx / this.state.cols);
            ctx.clearRect(
                col * this.state.spriteWidth,
                row * this.state.spriteHeight,
                this.state.spriteWidth,
                this.state.spriteHeight
            );
        });

        return offscreen.toDataURL("image/png");
    }

    getCanvasPoint(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }

    isPointInGrid(x, y) {
        return x < this.state.validWidth && y < this.state.validHeight;
    }

    getTileIndex(x, y) {
        const col = Math.floor(x / this.state.spriteWidth);
        const row = Math.floor(y / this.state.spriteHeight);
        return row * this.state.cols + col;
    }

    toggleTile(idx) {
        if (this.state.removed.has(idx)) this.state.removed.delete(idx);
        else this.state.removed.add(idx);
        this.afterSelectionUpdated();
    }

    afterSelectionUpdated() {
        this.draw();
        if (this.downloadLink) this.downloadLink.classList.remove("hidden");
    }
}
