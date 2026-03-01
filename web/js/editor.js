export class SpritesheetSelectionEditor {
    constructor(elements) {
        this.section = elements.section;
        this.canvas = elements.canvas;
        this.spriteWidthInput = elements.spriteWidthInput;
        this.spriteHeightInput = elements.spriteHeightInput;
        this.resetButton = elements.resetButton;
        this.selectedCount = elements.selectedCount;
        this.downloadLink = elements.downloadLink;

        this.selectAllButton = elements.selectAllButton;
        this.invertSelectionButton = elements.invertSelectionButton;
        this.previewCanvas = elements.previewCanvas;
        this.previewFpsInput = elements.previewFpsInput;
        this.previewBgColorInput = elements.previewBgColorInput;
        this.playPausePreviewButton = elements.playPausePreviewButton;

        this._hoverFrameRequest = null;

        this._previewFrameRequest = null;
        this.previewState = {
            isPlaying: true,
            currentFrameIndex: 0,
            lastFrameTime: 0
        };

        this.state = {
            image: null,
            spriteWidth: 64,
            spriteHeight: 64,
            cols: 0,
            rows: 0,
            validWidth: 0,
            validHeight: 0,
            selected: new Set(),
            hoverIndex: null
        };

        this.baseCanvas = null; // performans için cache

        this.bindEvents();
    }

    bindEvents() {
        if (this.spriteWidthInput)
            this.spriteWidthInput.addEventListener("change", () => this.onSpriteSizeChange());

        if (this.spriteHeightInput)
            this.spriteHeightInput.addEventListener("change", () => this.onSpriteSizeChange());

        if (this.resetButton)
            this.resetButton.addEventListener("click", () => this.resetSelection());

        if (this.selectAllButton)
            this.selectAllButton.addEventListener("click", () => this.selectAll());

        if (this.invertSelectionButton)
            this.invertSelectionButton.addEventListener("click", () => this.invertSelection());

        if (this.playPausePreviewButton)
            this.playPausePreviewButton.addEventListener("click", () => this.togglePreviewPlay());

        if (this.canvas) {
            this.canvas.addEventListener("click", (e) => this.onClick(e));
            this.canvas.addEventListener("mousemove", (e) => this.onHover(e));
            this.canvas.addEventListener("mouseleave", () => {
                this.state.hoverIndex = null;
                this.draw();
            });
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
            const MAX_DISPLAY_WIDTH = 1000;

            let scale = 1;

            if (img.width > MAX_DISPLAY_WIDTH) {
                scale = MAX_DISPLAY_WIDTH / img.width;
            }

            this.displayScale = scale;

            this.canvas.width = img.width;
            this.canvas.height = img.height;


            this.state.spriteWidth =
                parseInt(this.spriteWidthInput?.value, 10) || img.width;

            this.state.spriteHeight =
                parseInt(this.spriteHeightInput?.value, 10) || img.height;

            this.recalculateGrid();



            this.baseCanvas = document.createElement("canvas");
            this.baseCanvas.width = img.width;
            this.baseCanvas.height = img.height;
            this.baseCanvas.getContext("2d").drawImage(img, 0, 0);

            this.draw();
            this.startPreviewLoop();
        };

        img.src = sheetUrl;
    }

    recalculateGrid() {
        const { image, spriteWidth, spriteHeight } = this.state;

        this.state.cols = Math.floor(image.width / spriteWidth);
        this.state.rows = Math.floor(image.height / spriteHeight);
        this.state.validWidth = this.state.cols * spriteWidth;
        this.state.validHeight = this.state.rows * spriteHeight;
    }

    draw() {
        if (!this.state.image) return;

        const ctx = this.canvas.getContext("2d");
        const {
            spriteWidth,
            spriteHeight,
            selected,
            hoverIndex,
            cols,
            validWidth,
            validHeight
        } = this.state;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);


        ctx.drawImage(this.baseCanvas, 0, 0);

        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let x = spriteWidth; x <= validWidth; x += spriteWidth) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, validHeight);
        }

        for (let y = spriteHeight; y <= validHeight; y += spriteHeight) {
            ctx.moveTo(0, y);
            ctx.lineTo(validWidth, y);
        }

        ctx.stroke();


        ctx.fillStyle = "rgba(40,167,69,0.4)";
        selected.forEach((idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);

            ctx.fillRect(
                col * spriteWidth,
                row * spriteHeight,
                spriteWidth,
                spriteHeight
            );
        });


        if (hoverIndex !== null) {
            const col = hoverIndex % cols;
            const row = Math.floor(hoverIndex / cols);

            ctx.strokeStyle = "rgba(0,123,255,0.9)";
            ctx.lineWidth = 2;

            ctx.strokeRect(
                col * spriteWidth,
                row * spriteHeight,
                spriteWidth,
                spriteHeight
            );
        }

        if (this.selectedCount)
            this.selectedCount.textContent = `Selected: ${selected.size}`;
    }

    onClick(event) {
        const p = this.getCanvasPoint(event);
        if (!this.isPointInGrid(p.x, p.y)) return;

        const idx = this.getTileIndex(p.x, p.y);

        if (this.state.selected.has(idx))
            this.state.selected.delete(idx);
        else
            this.state.selected.add(idx);

        this.afterSelectionUpdated();
    }

    onHover(event) {
        if (this._hoverFrameRequest) return;

        this._hoverFrameRequest = requestAnimationFrame(() => {
            const p = this.getCanvasPoint(event);

            if (!this.isPointInGrid(p.x, p.y))
                this.state.hoverIndex = null;
            else
                this.state.hoverIndex = this.getTileIndex(p.x, p.y);

            this.draw();
            this._hoverFrameRequest = null;
        });
    }


    onSpriteSizeChange() {
        if (!this.state.image) return;

        const img = this.state.image;

        let w = parseInt(this.spriteWidthInput?.value, 10);
        let h = parseInt(this.spriteHeightInput?.value, 10);

        if (!w || w <= 0) w = 64;
        if (!h || h <= 0) h = 64;

        w = Math.min(w, img.width);
        h = Math.min(h, img.height);

        this.state.spriteWidth = w;
        this.state.spriteHeight = h;

        this.recalculateGrid();


        const maxIndex = this.state.cols * this.state.rows;
        this.state.selected = new Set(
            [...this.state.selected].filter(i => i < maxIndex)
        );

        this.draw();
    }



    resetSelection() {
        this.state.selected.clear();
        this.afterSelectionUpdated();
    }

    selectAll() {
        if (!this.state.image) return;
        const maxIndex = this.state.cols * this.state.rows;
        const newSelected = new Set();
        for (let i = 0; i < maxIndex; i++) {
            newSelected.add(i);
        }
        this.state.selected = newSelected;
        this.afterSelectionUpdated();
    }

    invertSelection() {
        if (!this.state.image) return;
        const maxIndex = this.state.cols * this.state.rows;
        const newSelected = new Set();
        for (let i = 0; i < maxIndex; i++) {
            if (!this.state.selected.has(i)) {
                newSelected.add(i);
            }
        }
        this.state.selected = newSelected;
        this.afterSelectionUpdated();
    }

    togglePreviewPlay() {
        this.previewState.isPlaying = !this.previewState.isPlaying;
        if (this.playPausePreviewButton) {
            this.playPausePreviewButton.innerHTML = this.previewState.isPlaying ? "⏸️ Pause" : "▶️ Play";
        }
        if (this.previewState.isPlaying) {
            this.previewState.lastFrameTime = performance.now();
            this.startPreviewLoop();
        } else {
            this.stopPreviewLoop();
        }
    }

    startPreviewLoop() {
        if (this._previewFrameRequest) return;
        if (!this.previewCanvas) return;
        this.previewState.lastFrameTime = performance.now();
        const loop = (time) => {
            if (!this.previewState.isPlaying) return;

            const fps = parseInt(this.previewFpsInput?.value, 10) || 12;
            const frameDuration = 1000 / fps;

            if (time - this.previewState.lastFrameTime >= frameDuration) {
                this.previewState.lastFrameTime = time;
                this.drawPreviewFrame();
            }

            this._previewFrameRequest = requestAnimationFrame(loop);
        };
        this._previewFrameRequest = requestAnimationFrame(loop);
    }

    stopPreviewLoop() {
        if (this._previewFrameRequest) {
            cancelAnimationFrame(this._previewFrameRequest);
            this._previewFrameRequest = null;
        }
    }

    drawPreviewFrame() {
        if (!this.previewCanvas || !this.state.image) return;
        const ctx = this.previewCanvas.getContext("2d");

        const bgColor = this.previewBgColorInput?.value || "#ffffff";

        if (this.state.selected.size === 0) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
            return;
        }

        const selectedArray = [...this.state.selected].sort((a, b) => a - b);

        if (this.previewState.currentFrameIndex >= selectedArray.length) {
            this.previewState.currentFrameIndex = 0;
        }

        const idx = selectedArray[this.previewState.currentFrameIndex];
        const col = idx % this.state.cols;
        const row = Math.floor(idx / this.state.cols);

        const { spriteWidth, spriteHeight } = this.state;

        if (this.previewCanvas.width !== spriteWidth || this.previewCanvas.height !== spriteHeight) {
            this.previewCanvas.width = spriteWidth;
            this.previewCanvas.height = spriteHeight;
        }

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);

        ctx.drawImage(
            this.state.image,
            col * spriteWidth,
            row * spriteHeight,
            spriteWidth,
            spriteHeight,
            0,
            0,
            spriteWidth,
            spriteHeight
        );

        if (this.previewState.isPlaying) {
            this.previewState.currentFrameIndex = (this.previewState.currentFrameIndex + 1) % selectedArray.length;
        }
    }

    export() {
        const newSheet = this.generateNewSheet();
        if (!newSheet) return null;
        return newSheet.toDataURL("image/png");
    }

    getCanvasPoint(event) {
        const rect = this.canvas.getBoundingClientRect();

        return {
            x: (event.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (event.clientY - rect.top) * (this.canvas.height / rect.height)
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

    afterSelectionUpdated() {
        this.draw();

        this.previewState.currentFrameIndex = 0;
        if (!this._previewFrameRequest && this.previewState.isPlaying) {
            this.startPreviewLoop();
        } else if (!this.previewState.isPlaying) {
            this.drawPreviewFrame();
        }

        const newSheet = this.generateNewSheet();
        if (newSheet) {
            const previewUrl = newSheet.toDataURL("image/png");

            const sheetImg = document.getElementById("sheet");
            const placeholder = document.getElementById("sheetPlaceholder");

            if (sheetImg) {
                sheetImg.src = previewUrl;
                sheetImg.classList.remove("hidden");
            }

            if (placeholder) {
                placeholder.style.display = "none";
            }
            if (this.downloadLink) {
                this.downloadLink.classList.remove("hidden");
            }
        } else {
            const sheetImg = document.getElementById("sheet");
            const placeholder = document.getElementById("sheetPlaceholder");
            if (sheetImg) sheetImg.classList.add("hidden");
            if (placeholder) {
                placeholder.style.display = "block";
                placeholder.textContent = "Please select at least one frame.";
            }
            if (this.downloadLink) this.downloadLink.classList.add("hidden");
        }
    }


    generateNewSheet() {
        if (!this.state.image || this.state.selected.size === 0) return null;

        const {
            spriteWidth,
            spriteHeight,
            selected,
            cols,
            image
        } = this.state;

        const selectedArray = [...selected].sort((a, b) => a - b);

        const newCanvas = document.createElement("canvas");
        newCanvas.width = spriteWidth * selectedArray.length;
        newCanvas.height = spriteHeight;

        const ctx = newCanvas.getContext("2d");

        selectedArray.forEach((idx, i) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);

            ctx.drawImage(
                image,
                col * spriteWidth,
                row * spriteHeight,
                spriteWidth,
                spriteHeight,
                i * spriteWidth,
                0,
                spriteWidth,
                spriteHeight
            );
        });

        return newCanvas;
    }
}
