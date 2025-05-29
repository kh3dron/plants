class TreeRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Pan and zoom state
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.lastX = 0;
        this.lastY = 0;

        // Mouse event listeners
        this.canvas.addEventListener('mousedown', this.startDrag.bind(this));
        this.canvas.addEventListener('mousemove', this.drag.bind(this));
        this.canvas.addEventListener('mouseup', this.endDrag.bind(this));
        this.canvas.addEventListener('mouseleave', this.endDrag.bind(this));
        this.canvas.addEventListener('wheel', this.handleZoom.bind(this));

        // Touch event listeners
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));

        // Double tap to reset
        this.canvas.addEventListener('dblclick', this.resetView.bind(this));
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
        this.canvas.style.cursor = 'grabbing';
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
        this.canvas.style.cursor = 'grab';
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

    // Drawing methods
    drawTree(instructions, angle, length) {
        this.clear();
        
        const stack = [];
        let x = this.canvas.width / 2;
        let y = this.canvas.height;
        let currentAngle = -90; // Start pointing up
        
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);
        
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#2c3e50';
        this.ctx.lineWidth = 2 / this.scale; // Adjust line width based on scale
        
        for (let char of instructions) {
            switch (char) {
                case 'F':
                    const newX = x + Math.cos(currentAngle * Math.PI / 180) * length;
                    const newY = y + Math.sin(currentAngle * Math.PI / 180) * length;
                    this.ctx.moveTo(x, y);
                    this.ctx.lineTo(newX, newY);
                    x = newX;
                    y = newY;
                    break;
                case '+':
                    currentAngle += angle;
                    break;
                case '-':
                    currentAngle -= angle;
                    break;
                case '[':
                    stack.push({ x, y, angle: currentAngle });
                    break;
                case ']':
                    const state = stack.pop();
                    x = state.x;
                    y = state.y;
                    currentAngle = state.angle;
                    break;
            }
        }
        
        this.ctx.stroke();
        this.ctx.restore();
    }

    // Helper method to redraw the current state
    redraw() {
        if (this.lastInstructions) {
            this.drawTree(this.lastInstructions, this.lastAngle, this.lastLength);
        }
    }

    // Store the last drawing parameters for redrawing
    setLastParams(instructions, angle, length) {
        this.lastInstructions = instructions;
        this.lastAngle = angle;
        this.lastLength = length;
    }
} 