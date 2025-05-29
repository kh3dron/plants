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

    // Parse rules string to stochastic array (probability 1 for each)
    function parseRulesToStochastic(rulesString) {
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

    // Generate fractal function
    function generateFractal() {
        const selectedFractal = fractalDefinitions[fractalTypeSelect.value];
        const rulesArray = parseRulesToStochastic(selectedFractal.rules);
        const lsystem = new LSystem(selectedFractal.axiom, rulesArray);
        const instructions = lsystem.generate(parseInt(iterationsInput.value));
        
        // Store parameters for redrawing
        renderer.setLastParams(instructions, selectedFractal.angle, parseInt(sizeInput.value));
        
        // Draw the fractal
        renderer.drawTree(instructions, selectedFractal.angle, parseInt(sizeInput.value));
    }

    // Event listeners
    generateButton.addEventListener('click', generateFractal);

    // Initial generation
    generateFractal();
});
