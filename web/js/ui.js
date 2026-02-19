
import API from "./api.js"
import { SpritesheetSelectionEditor } from "./editor.js";
let spritesheetEditor = null;

const api = new API();

function bindRangeDisplay(inputId, outputId) {
    const input = document.getElementById(inputId);
    const output = document.getElementById(outputId);
    if (!input || !output) return;

    input.addEventListener("input", (e) => {
        output.textContent = e.target.value;
    });
}


export function updateResults(status) {
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
        if (!spritesheetEditor) {
            spritesheetEditor = new SpritesheetSelectionEditor({
                section: document.getElementById("spritesheetEditorSection"),
                canvas: document.getElementById("sheetEditorCanvas"),
                spriteWidthInput: document.getElementById("spriteWidth"),
                spriteHeightInput: document.getElementById("spriteHeight"),
                resetButton: document.getElementById("resetEditor"),
                selectedCount: document.getElementById("removedCount"),
                downloadLink: document.getElementById("sheetEditedDownload")
            });
        }
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

function formatStepName(name) {
    return name
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}


export function updateProgress(status) {
    if (!status.steps || status.steps.length === 0) return;

    const progressBar = document.getElementById("progressBar");
    const progressPercent = document.getElementById("progressPercent");
    const progressStatusText = document.getElementById("progressStatusText");

    const totalSteps = status.steps.length;

    const completedSteps = status.steps.filter(step => {
        const s = step.status || step.Status;
        return s === "completed" || s === "done";
    }).length;

    const runningStep = status.steps.find(step => {
        const s = step.status || step.Status;
        return s === "running" || s === "processing";
    });


    const percent = Math.round((completedSteps / totalSteps) * 100);


    progressBar.style.width = percent + "%";
    progressPercent.textContent = percent + "%";


    if (runningStep) {
        progressStatusText.textContent =
            "Processing: " + formatStepName(runningStep.name);
    } else if (completedSteps === totalSteps) {
        progressStatusText.textContent = "All steps completed 🎉";
    } else {
        progressStatusText.textContent = "Starting...";
    }

    if (completedSteps === totalSteps) {
        document.getElementById("progressSection")
            .classList.add("completed");
    }
}



export function initDisplays() {
    const chromaColorInput = document.getElementById("chromaColor");
    if (chromaColorInput) {
        chromaColorInput.addEventListener("input", (e) => {
            document.getElementById("chromaColorValue").textContent = e.target.value.toUpperCase();
        });
    }

    bindRangeDisplay("threshold", "thresholdValue");
    bindRangeDisplay("similarity", "similarityValue");
    bindRangeDisplay("fps", "fpsValue");
    bindRangeDisplay("size", "sizeValue");
}


export function initUpload(setJobId) {
    document.getElementById("upload").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        const infoBox = document.getElementById("videoInfo");
        if (!file) return;

        try {
            const result = await api.uploadFile(file);

            setJobId(result.job_id);

            const video = document.getElementById("preview");
            video.src = result.preview;
            video.load();

            const generateBtn = document.getElementById("generate");
            generateBtn.disabled = false;
            generateBtn.textContent = "🚀 Generate Spritesheet";
            showVideoInfo(file, infoBox);

        } catch (error) {
            console.error(error);
        }
    });
}

export function initGenerate(getJobId, connectStatusSocket) {



    document.getElementById("generate").addEventListener("click", async () => {
        let jobId = getJobId();
        console.log("JobId", jobId);
        if (!jobId) return;

        const errorMsg = document.getElementById("errorMessage");
        errorMsg.classList.remove("show");

        const generateBtn = document.getElementById("generate");
        generateBtn.disabled = true;


        resetResultCards();

        const progressSection = document.getElementById("progressSection");
        progressSection.classList.remove("hidden");
        progressSection.classList.add("active");

        connectStatusSocket(jobId);

        const payload = {
            job_id: jobId,
            threshold: parseFloat(document.getElementById("threshold").value),
            similarity: parseFloat(document.getElementById("similarity").value),
            tile: document.getElementById("tile").value,
            chroma_color: document.getElementById("chromaColor").value,
            fps: parseInt(document.getElementById("fps").value, 10),
            size: parseInt(document.getElementById("size").value)
        };
        await api.generate(payload);
    });
}
export function showVideoInfo(file, infoElement) {
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = function () {
        URL.revokeObjectURL(video.src);

        const width = video.videoWidth;
        const height = video.videoHeight;
        const duration = video.duration.toFixed(2);

        infoElement.textContent =
            `Resolution: ${width}x${height} | Duration: ${duration}s`;
    };

    video.src = URL.createObjectURL(file);
}

