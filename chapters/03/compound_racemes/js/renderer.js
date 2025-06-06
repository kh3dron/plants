class TreeRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.resizeCanvas();
        window.addEventListener("resize", () => this.resizeCanvas());

        // Pan and zoom state
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.lastX = 0;
        this.lastY = 0;

        // Mouse event listeners
        this.canvas.addEventListener("mousedown", this.startDrag.bind(this));
        this.canvas.addEventListener("mousemove", this.drag.bind(this));
        this.canvas.addEventListener("mouseup", this.endDrag.bind(this));
        this.canvas.addEventListener("mouseleave", this.endDrag.bind(this));
        this.canvas.addEventListener("wheel", this.handleZoom.bind(this));

        // Touch event listeners
        this.canvas.addEventListener(
            "touchstart",
            this.handleTouchStart.bind(this),
        );
        this.canvas.addEventListener(
            "touchmove",
            this.handleTouchMove.bind(this),
        );
        this.canvas.addEventListener(
            "touchend",
            this.handleTouchEnd.bind(this),
        );

        // Double tap to reset
        this.canvas.addEventListener("dblclick", this.resetView.bind(this));
    }

    resizeCanvas() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Pan and zoom methods
    startDrag(e) {
        this.isDragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.canvas.style.cursor = "grabbing";
    }

    drag(e) {
        if (!this.isDragging) return;

        const deltaX = e.clientX - this.lastX;
        const deltaY = e.clientY - this.lastY;

        this.offsetX += deltaX;
        this.offsetY += deltaY;

        this.lastX = e.clientX;
        this.lastY = e.clientY;

        this.redraw();
    }

    endDrag() {
        this.isDragging = false;
        this.canvas.style.cursor = "grab";
    }

    handleZoom(e) {
        e.preventDefault();
        const delta = e.deltaY;
        const zoomFactor = delta > 0 ? 0.9 : 1.1;

        // Get mouse position relative to canvas
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate new scale and offset
        const newScale = this.scale * zoomFactor;

        // Limit zoom level
        if (newScale < 0.1 || newScale > 10) return;

        // Adjust offset to zoom towards mouse position
        this.offsetX = mouseX - (mouseX - this.offsetX) * zoomFactor;
        this.offsetY = mouseY - (mouseY - this.offsetY) * zoomFactor;

        this.scale = newScale;
        this.redraw();
    }

    handleTouchStart(e) {
        if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastX = e.touches[0].clientX;
            this.lastY = e.touches[0].clientY;
        }
    }

    handleTouchMove(e) {
        if (!this.isDragging || e.touches.length !== 1) return;

        const deltaX = e.touches[0].clientX - this.lastX;
        const deltaY = e.touches[0].clientY - this.lastY;

        this.offsetX += deltaX;
        this.offsetY += deltaY;

        this.lastX = e.touches[0].clientX;
        this.lastY = e.touches[0].clientY;

        this.redraw();
    }

    handleTouchEnd() {
        this.isDragging = false;
    }

    resetView() {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.redraw();
    }

    // Parse parameters from a symbol
    parseParameters(symbol) {
        const match = symbol.match(/([A-Za-z])\(([^)]+)\)/);
        if (match) {
            return {
                symbol: match[1],
                params: match[2].split(",").map((p) => parseFloat(p.trim())),
            };
        }
        return { symbol, params: [] };
    }

    // Drawing methods
    drawTree(instructions, angle, length) {
        console.log("Plant string:", instructions);
        this.clear();

        // Store the angle for use in drawing
        this.currentAngle = angle;

        // --- 1. Simulate to get bounding box ---
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        let x = 0, y = 0, currentAngle = -90; // Start pointing upward
        const stack = [];
        function updateBounds(x, y) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        updateBounds(x, y);

        // First pass: Calculate bounds
        let currentPos = 0;
        while (currentPos < instructions.length) {
            const char = instructions[currentPos];
            switch (char) {
                case "a":
                case "A":
                case "I":
                case "B": {
                    const newX = x + Math.cos(currentAngle * Math.PI / 180) * length;
                    const newY = y + Math.sin(currentAngle * Math.PI / 180) * length;
                    updateBounds(newX, newY);
                    x = newX;
                    y = newY;
                    break;
                }
                case "L": {
                    const leafLength = length * 0.6;
                    const leafWidth = length * 0.3;
                    const stemEndX = x + Math.cos(currentAngle * Math.PI / 180) * (leafLength * 0.3);
                    const stemEndY = y + Math.sin(currentAngle * Math.PI / 180) * (leafLength * 0.3);
                    updateBounds(stemEndX + leafLength, stemEndY + leafWidth);
                    break;
                }
                case "b": {
                    const flowerRadius = length * 0.15;
                    const petalLength = length * 0.2;
                    const stemEndX = x + Math.cos(currentAngle * Math.PI / 180) * (length * 0.3);
                    const stemEndY = y + Math.sin(currentAngle * Math.PI / 180) * (length * 0.3);
                    updateBounds(stemEndX + petalLength, stemEndY + petalLength);
                    break;
                }
                case "+":
                    currentAngle += angle;
                    break;
                case "-":
                    currentAngle -= angle;
                    break;
                case "[":
                    stack.push({ x, y, angle: currentAngle });
                    break;
                case "]": {
                    const state = stack.pop();
                    x = state.x;
                    y = state.y;
                    currentAngle = state.angle;
                    break;
                }
            }
            currentPos++;
        }

        // --- 2. Compute scale and offset to fit bounding box in canvas ---
        const bboxWidth = maxX - minX;
        const bboxHeight = maxY - minY;
        const padding = 20; // px
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const scaleX = (canvasWidth - padding * 2) / bboxWidth;
        const scaleY = (canvasHeight - padding * 2) / bboxHeight;
        const fitScale = Math.min(scaleX, scaleY);

        // Centering offset
        const offsetX = (canvasWidth - bboxWidth * fitScale) / 2 - minX * fitScale;
        const offsetY = (canvasHeight - bboxHeight * fitScale) / 2 - minY * fitScale;

        // --- 3. Draw with transform ---
        x = 0;
        y = 0;
        currentAngle = -90;
        stack.length = 0;

        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        this.ctx.translate(offsetX, offsetY);
        this.ctx.scale(fitScale, fitScale);

        // Draw the plant
        currentPos = 0;
        while (currentPos < instructions.length) {
            const char = instructions[currentPos];
            switch (char) {
                case "a":
                case "A":
                case "I":
                case "B": {
                    const newX = x + Math.cos(currentAngle * Math.PI / 180) * length;
                    const newY = y + Math.sin(currentAngle * Math.PI / 180) * length;
                    
                    // Draw stem
                    this.ctx.save();
                    this.ctx.strokeStyle = "#8B5A2B"; // Brown color for stems
                    this.ctx.lineWidth = 2 / fitScale;
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, y);
                    this.ctx.lineTo(newX, newY);
                    this.ctx.stroke();
                    this.ctx.restore();
                    
                    x = newX;
                    y = newY;
                    break;
                }
                case "L": {
                    // Draw leaf
                    const leafLength = length * 0.3;
                    const leafWidth = length * 0.15;
                    
                    // Draw leaf stem
                    this.ctx.save();
                    this.ctx.strokeStyle = "#8B5A2B";
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, y);
                    const stemEndX = x + Math.cos(currentAngle * Math.PI / 180) * (leafLength * 0.3);
                    const stemEndY = y + Math.sin(currentAngle * Math.PI / 180) * (leafLength * 0.3);
                    this.ctx.lineTo(stemEndX, stemEndY);
                    this.ctx.stroke();
                    
                    // Draw leaf blade
                    this.ctx.fillStyle = "#228B22"; // Forest green
                    this.ctx.beginPath();
                    this.ctx.ellipse(
                        stemEndX,
                        stemEndY,
                        leafLength,
                        leafWidth,
                        currentAngle * Math.PI / 180,
                        0,
                        2 * Math.PI
                    );
                    this.ctx.fill();
                    this.ctx.restore();
                    break;
                }
                case "F": {
                    // Draw flower
                    const flowerRadius = length * 0.15;
                    const petalLength = length * 0.2;
                    const petalWidth = length * 0.1;
                    
                    // Draw flower stem
                    this.ctx.save();
                    this.ctx.strokeStyle = "#8B5A2B";
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, y);
                    const stemEndX = x + Math.cos(currentAngle * Math.PI / 180) * (length * 0.3);
                    const stemEndY = y + Math.sin(currentAngle * Math.PI / 180) * (length * 0.3);
                    this.ctx.lineTo(stemEndX, stemEndY);
                    this.ctx.stroke();
                    
                    // Draw petals
                    const petalCount = 6;
                    for (let i = 0; i < petalCount; i++) {
                        const petalAngle = (i * 360 / petalCount) + currentAngle;
                        const petalX = stemEndX + Math.cos(petalAngle * Math.PI / 180) * flowerRadius;
                        const petalY = stemEndY + Math.sin(petalAngle * Math.PI / 180) * flowerRadius;
                        
                        this.ctx.beginPath();
                        this.ctx.fillStyle = "#0088FF"; // Blue petals
                        this.ctx.ellipse(
                            petalX,
                            petalY,
                            petalLength,
                            petalWidth,
                            petalAngle * Math.PI / 180,
                            0,
                            2 * Math.PI
                        );
                        this.ctx.fill();
                    }
                    
                    // Draw flower center
                    this.ctx.beginPath();
                    this.ctx.fillStyle = "#FFD700"; // Golden center
                    this.ctx.arc(stemEndX, stemEndY, flowerRadius * 0.3, 0, 2 * Math.PI);
                    this.ctx.fill();
                    this.ctx.restore();
                    break;
                }
                case "+":
                    currentAngle += angle;
                    break;
                case "-":
                    currentAngle -= angle;
                    break;
                case "[":
                    stack.push({ x, y, angle: currentAngle });
                    break;
                case "]": {
                    const state = stack.pop();
                    x = state.x;
                    y = state.y;
                    currentAngle = state.angle;
                    break;
                }
            }
            currentPos++;
        }

        this.ctx.restore();
        
        // Store parameters for redrawing
        this.setLastParams(instructions, angle, length);
    }

    // Helper method to redraw the current state
    redraw() {
        if (this.lastInstructions) {
            this.drawTree(
                this.lastInstructions,
                this.lastAngle,
                this.lastLength,
            );
        }
    }

    // Store the last drawing parameters for redrawing
    setLastParams(instructions, angle, length) {
        this.lastInstructions = instructions;
        this.lastAngle = angle;
        this.lastLength = length;
    }
}
