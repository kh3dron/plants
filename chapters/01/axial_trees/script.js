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
    function parseRulesToStochastic(rulesString) {
        // Parse rules from textarea (e.g. F=FF+[+F-F-F]-[-F+F+F])
        // Returns array: [{symbol: 'F', replacement: '...', probability: 1}]
        return rulesString
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                const [symbol, replacement] = line.split('=');
                return {
                    symbol: symbol.trim(),
                    replacement: replacement.trim(),
                    probability: 1
                };
            });
    }

    function generateTree() {
        const rulesArray = parseRulesToStochastic(rulesInput.value);
        const lsystem = new LSystem(axiomInput.value, rulesArray);
        const instructions = lsystem.generate(parseInt(iterationsInput.value));
        
        // Store parameters for redrawing
        renderer.setLastParams(instructions, parseInt(angleInput.value), parseInt(lengthInput.value));
        
        // Draw the tree
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