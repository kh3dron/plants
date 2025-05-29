document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('treeCanvas');

    // Ensure canvas has correct pixel size
    function resizeCanvasToDisplaySize() {
        const container = canvas.parentElement;
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
    }
    resizeCanvasToDisplaySize();
    window.addEventListener('resize', resizeCanvasToDisplaySize);

    const renderer = new TreeRenderer(canvas);

    // Get DOM elements
    const iterationsInput = document.getElementById('iterations');
    const iterationsValue = document.getElementById('iterations-value');
    const angleInput = document.getElementById('angle');
    const angleValue = document.getElementById('angle-value');
    // Branch length controls removed
    const axiomInput = document.getElementById('axiom');
    const seedInput = document.getElementById('seed');
    const rulesTable = document.getElementById('rules-table');
    const addRuleButton = document.getElementById('add-rule');
    const generateButton = document.getElementById('generate');
    const randomizeButton = document.getElementById('randomize');

    // Template buttons
    const templateButtons = document.querySelectorAll('.template-btn');

    // Use inlined template array
    let templates = [
        {
            name: "Simple Raceme (Open)",
            angle: 45,
            axiom: "a",
            patterns: [
                { name: "Stem", variable: "a", shape: "line", color: "#8B5A2B" },
                { name: "Mature Stem", variable: "A", shape: "line", color: "#8B5A2B" },
                { name: "Internode", variable: "I", shape: "line", color: "#B8860B" },
                { name: "Leaf", variable: "L", shape: "circle", color: "#228B22" },
                { name: "Flower", variable: "K", shape: "circle", color: "#FFCC00" }
            ],
            rules: [
                { a: "I[L]a", probability: 0.7 },
                { a: "I[L]A", probability: 0.3 },
                { A: "I[K]A", probability: 1 }
            ]
        }
    ];
    let patterns = [];
    // Load first template by default
    loadTemplate(0);

    // Load template into UI
    function loadTemplate(idx) {
        const t = templates[idx];
        if (!t) return;
        angleInput.value = t.angle;
        angleValue.textContent = `${t.angle}°`;
        axiomInput.value = t.axiom;
        patterns = t.patterns || [];
        // Clear rules table
        const tbody = rulesTable.querySelector('tbody');
        tbody.innerHTML = '';
        // New rules format: array of objects with one key (symbol), value is replacement, plus probability
        t.rules.forEach(rule => {
            const symbol = Object.keys(rule).find(k => k !== 'probability');
            const replacement = rule[symbol];
            const probability = rule.probability;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><input type="text" class="rule-symbol" value="${symbol}" maxlength="1" style="width:2em;"></td>
                <td><input type="text" class="rule-replacement" value="${replacement}"></td>
                <td><input type="number" class="rule-probability" value="${probability}" min="0" max="1" step="0.01" style="width:4em;"></td>
                <td><button type="button" class="remove-rule">&minus;</button></td>
            `;
            tbody.appendChild(row);
        });
        generateTree();
    }

    templateButtons.forEach(btn => {
        btn.addEventListener('click', e => {
            const idx = parseInt(btn.getAttribute('data-template'));
            loadTemplate(idx);
        });
    });

    // Simple seeded RNG (mulberry32)
    function mulberry32(seed) {
        let t = seed;
        return function () {
            t += 0x6D2B79F5;
            let r = Math.imul(t ^ t >>> 15, 1 | t);
            r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
            return ((r ^ r >>> 14) >>> 0) / 4294967296;
        }
    }
    function stringToSeed(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
        }
        return hash >>> 0;
    }

    // Helper to parse rules from table
    function parseRulesFromTable() {
        const rules = [];
        const rows = rulesTable.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const symbol = row.querySelector('.rule-symbol').value.trim();
            const replacement = row.querySelector('.rule-replacement').value.trim();
            const probability = parseFloat(row.querySelector('.rule-probability').value);
            if (symbol && replacement && !isNaN(probability)) {
                rules.push({ symbol, replacement, probability });
            }
        });
        return rules;
    }

    // Add rule row
    addRuleButton.addEventListener('click', () => {
        const tbody = rulesTable.querySelector('tbody');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="rule-symbol" maxlength="1" style="width:2em;"></td>
            <td><input type="text" class="rule-replacement"></td>
            <td><input type="number" class="rule-probability" min="0" max="1" step="0.01" style="width:4em;"></td>
            <td><button type="button" class="remove-rule">&minus;</button></td>
        `;
        tbody.appendChild(row);
    });

    // Remove rule row
    rulesTable.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-rule')) {
            const row = e.target.closest('tr');
            row.parentNode.removeChild(row);
        }
    });

    // Update display values and generate tree
    iterationsInput.addEventListener('input', () => {
        iterationsValue.textContent = iterationsInput.value;
        generateTree();
    });

    angleInput.addEventListener('input', () => {
        angleValue.textContent = `${angleInput.value}°`;
        generateTree();
    });

    // Branch length controls removed

    axiomInput.addEventListener('input', generateTree);
    seedInput.addEventListener('input', generateTree);
    rulesTable.addEventListener('input', generateTree);

    // Generate tree function
    function generateTree() {
        const rules = parseRulesFromTable();
        const seed = stringToSeed(seedInput.value);
        const rng = mulberry32(seed);
        const lsystem = new LSystem(axiomInput.value, rules, rng);
        const instructions = lsystem.generate(parseInt(iterationsInput.value));
        const fixedLength = 10; // Set a fixed branch length
        renderer.setLastParams(instructions, parseInt(angleInput.value), fixedLength, patterns);
        renderer.drawTree(instructions, parseInt(angleInput.value), fixedLength, patterns);
    }

    // Randomize function
    function randomize() {
        const randomAngle = Math.floor(Math.random() * 45) + 15; // 15-60 degrees
        const randomIterations = Math.floor(Math.random() * 5) + 3; // 3-8 iterations
        angleInput.value = randomAngle;
        angleValue.textContent = `${randomAngle}°`;
        iterationsInput.value = randomIterations;
        iterationsValue.textContent = randomIterations;
        generateTree();
    }

    generateButton.addEventListener('click', generateTree);
    randomizeButton.addEventListener('click', randomize);

    // Initial generation
    generateTree();
}); 