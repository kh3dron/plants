class TreeRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawTree(instructions, angle, length) {
        this.clear();
        
        const stack = [];
        let x = this.canvas.width / 2;
        let y = this.canvas.height;
        let currentAngle = -90; // Start pointing up
        
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#2c3e50';
        this.ctx.lineWidth = 2;
        
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
    }
} 