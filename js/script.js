class LSystem {
    constructor(axiom, rules) {
        this.axiom = axiom;
        this.rules = this.parseRules(rules);
    }

    parseRules(rulesString) {
        const rules = {};
        const rulePairs = rulesString.split('\n').filter(rule => rule.trim());
        
        rulePairs.forEach(rule => {
            const [key, value] = rule.split('=').map(s => s.trim());
            rules[key] = value;
        });
        
        return rules;
    }

    generate(iterations) {
        let result = this.axiom;
        
        for (let i = 0; i < iterations; i++) {
            let newResult = '';
            for (let char of result) {
                newResult += this.rules[char] || char;
            }
            result = newResult;
        }
        
        return result;
    }
}

class TreeRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        // Get the controls panel width (if present)
        const controls = document.querySelector('.controls');
        let leftOffset = 0;
        if (controls) {
            const rect = controls.getBoundingClientRect();
            leftOffset = rect.right;
        }
        // Set canvas size to fill the visible area (not under controls)
        const container = this.canvas.parentElement;
        const width = window.innerWidth - leftOffset;
        const height = window.innerHeight - 4 * 16; // 4rem header
        this.canvas.width = width > 0 ? width : 0;
        this.canvas.height = height > 0 ? height : 0;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        this.canvas.style.left = leftOffset + 'px';
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

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('treeCanvas');
    const renderer = new TreeRenderer(canvas);
    
    // Get DOM elements
    const iterationsInput = document.getElementById('iterations');
    const iterationsValue = document.getElementById('iterations-value');
    const angleInput = document.getElementById('angle');
    const angleValue = document.getElementById('angle-value');
    const lengthInput = document.getElementById('length');
    const lengthValue = document.getElementById('length-value');
    const axiomInput = document.getElementById('axiom');
    const rulesInput = document.getElementById('rules');
    const generateButton = document.getElementById('generate');
    const randomizeButton = document.getElementById('randomize');

    // Update display values and generate tree
    iterationsInput.addEventListener('input', () => {
        iterationsValue.textContent = iterationsInput.value;
        generateTree();
    });

    angleInput.addEventListener('input', () => {
        angleValue.textContent = `${angleInput.value}°`;
        generateTree();
    });

    lengthInput.addEventListener('input', () => {
        lengthValue.textContent = lengthInput.value;
        generateTree();
    });

    // Also generate on text input changes
    axiomInput.addEventListener('input', generateTree);
    rulesInput.addEventListener('input', generateTree);

    // Generate tree function
    function generateTree() {
        const lsystem = new LSystem(axiomInput.value, rulesInput.value);
        const instructions = lsystem.generate(parseInt(iterationsInput.value));
        renderer.drawTree(instructions, parseInt(angleInput.value), parseInt(lengthInput.value));
    }

    // Randomize function
    function randomize() {
        const randomAngle = Math.floor(Math.random() * 45) + 15; // 15-60 degrees
        const randomLength = Math.floor(Math.random() * 15) + 5; // 5-20 pixels
        const randomIterations = Math.floor(Math.random() * 5) + 3; // 3-8 iterations
        
        angleInput.value = randomAngle;
        angleValue.textContent = `${randomAngle}°`;
        lengthInput.value = randomLength;
        lengthValue.textContent = randomLength;
        iterationsInput.value = randomIterations;
        iterationsValue.textContent = randomIterations;
        
        generateTree();
    }

    // Event listeners
    generateButton.addEventListener('click', generateTree);
    randomizeButton.addEventListener('click', randomize);

    // Initial generation
    generateTree();
}); 