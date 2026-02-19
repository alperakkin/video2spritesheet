export class SpritesheetSelectionEditor {
    constructor(elements) {
        this.section = elements.section;
        this.canvas = elements.canvas;
        this.spriteWidthInput = elements.spriteWidthInput;
        this.spriteHeightInput = elements.spriteHeightInput;
        this.resetButton = elements.resetButton;
        this.selectedCount = elements.selectedCount;
        this.downloadLink = elements.downloadLink;
        this._hoverFrameRequest = null;


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
        this.draw();
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
        }

        if (this.downloadLink)
            this.downloadLink.classList.remove("hidden");
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
