document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('fractalCanvas');
    const renderer = new TreeRenderer(canvas);
    
    // Get DOM elements
    const fractalTypeSelect = document.getElementById('fractal-type');
    const iterationsInput = document.getElementById('iterations');
    const iterationsValue = document.getElementById('iterations-value');
    const sizeInput = document.getElementById('size');
    const sizeValue = document.getElementById('size-value');
    const axiomInput = document.getElementById('axiom');
    const rulesInput = document.getElementById('rules');
    const generateButton = document.getElementById('generate');

    // Fractal definitions
    const fractalDefinitions = {
        hilbert: {
            axiom: 'L',
            rules: 'L=+RF-LFL-FR+\nR=-LF+RFR+FL-',
            angle: 90,
            initialAngle: 0
        },
        koch: {
            axiom: 'F-F-F-F',
            rules: 'F=F+F-F-FF+F+F-F',
            angle: 90,
            initialAngle: 0
        },
        snowflake: {
            axiom: 'F--F--F',
            rules: 'F=F+F--F+F',
            angle: 60,
            initialAngle: 0
        }
    };

    // Update display values
    iterationsInput.addEventListener('input', () => {
        iterationsValue.textContent = iterationsInput.value;
        generateFractal();
    });

    sizeInput.addEventListener('input', () => {
        sizeValue.textContent = sizeInput.value;
        generateFractal();
    });

    fractalTypeSelect.addEventListener('change', () => {
        const selectedFractal = fractalDefinitions[fractalTypeSelect.value];
        axiomInput.value = selectedFractal.axiom;
        rulesInput.value = selectedFractal.rules;
        generateFractal();
    });

    // Generate fractal function
    function generateFractal() {
        const selectedFractal = fractalDefinitions[fractalTypeSelect.value];
        const lsystem = new LSystem(selectedFractal.axiom, selectedFractal.rules);
        const instructions = lsystem.generate(parseInt(iterationsInput.value));
        
        // Clear canvas and set up for drawing
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Calculate appropriate starting position and scale
        const size = parseInt(sizeInput.value);
        const scale = Math.min(canvas.width, canvas.height) / (Math.pow(2, parseInt(iterationsInput.value)) * size);
        
        // Set initial position to center of canvas
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(scale, scale);
        
        // Draw the fractal
        let x = 0, y = 0;
        let angle = selectedFractal.initialAngle;
        const stack = [];

        for (const instruction of instructions) {
            switch (instruction) {
                case 'F':
                    const newX = x + Math.cos(angle * Math.PI / 180) * size;
                    const newY = y + Math.sin(angle * Math.PI / 180) * size;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(newX, newY);
                    ctx.stroke();
                    x = newX;
                    y = newY;
                    break;
                case '+':
                    angle += selectedFractal.angle;
                    break;
                case '-':
                    angle -= selectedFractal.angle;
                    break;
                case '[':
                    stack.push({ x, y, angle });
                    break;
                case ']':
                    const state = stack.pop();
                    x = state.x;
                    y = state.y;
                    angle = state.angle;
                    break;
            }
        }
        
        ctx.restore();
    }

    // Event listeners
    generateButton.addEventListener('click', generateFractal);

    // Initial generation
    generateFractal();
});
