export class SpritesheetSelectionEditor {
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