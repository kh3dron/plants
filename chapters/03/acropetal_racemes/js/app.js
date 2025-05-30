// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("treeCanvas");
  const renderer = new TreeRenderer(canvas);

  // Get DOM elements
  const iterationsInput = document.getElementById("iterations");
  const iterationsValue = document.getElementById("iterations-value");
  const angleInput = document.getElementById("angle");
  const angleValue = document.getElementById("angle-value");
  const axiomInput = document.getElementById("axiom");
  const seedInput = document.getElementById("seed");
  const generateButton = document.getElementById("generate");
  const randomizeButton = document.getElementById("randomize");
  const templateButtons = document.querySelectorAll(".template-btn");
  const rulesTable = document.getElementById("rules-table");
  const addRuleButton = document.getElementById("add-rule");

  // Update display values
  iterationsInput.addEventListener("input", () => {
    iterationsValue.textContent = iterationsInput.value;
    generateTree();
  });

  angleInput.addEventListener("input", () => {
    angleValue.textContent = `${angleInput.value}°`;
    generateTree();
  });

  // Get rules from table
  function getRules() {
    const rules = [];
    const rows = rulesTable.querySelectorAll("tbody tr");
    rows.forEach((row) => {
      const symbol = row.querySelector(".rule-symbol").value;
      const replacement = row.querySelector(".rule-replacement").value;
      const probability = parseFloat(
        row.querySelector(".rule-probability").value,
      );
      if (symbol && replacement && !isNaN(probability)) {
        rules.push({ symbol, replacement, probability });
      }
    });
    return rules;
  }

  // Generate tree function
  function generateTree() {
    const rules = getRules();
    const seed = parseInt(seedInput.value) || 1;
    const rng = new Math.seedrandom(seed.toString());

    const lsystem = new LSystem(axiomInput.value, rules, rng);
    const instructions = lsystem.generate(parseInt(iterationsInput.value));
    const angle = parseInt(angleInput.value);
    console.log('Using angle:', angle); // Debug log
    renderer.drawTree(instructions, angle, 10); // Fixed length of 10
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

  // Template handling
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
        { name: "Flower", variable: "K", shape: "circle", color: "#FFCC00" },
      ],
      rules: [
        { a: "I[+IL][-IL]a", probability: 0.9 },
        { a: "A(1)", probability: 0.1 },
        { A: "I(${0})[+I(${0})K(${0})][-I(${0})K(${0})]A(${0} * 0.9)", probability: 1 },
      ],
    },
  ];
  let patterns = [];
  // Load first template by default
  // Load template into UI
  function loadTemplate(idx) {
    const t = templates[idx];
    if (!t) return;
    angleInput.value = t.angle;
    angleValue.textContent = `${t.angle}°`;
    axiomInput.value = t.axiom;
    patterns = t.patterns || [];
    // Clear rules table
    const tbody = rulesTable.querySelector("tbody");
    tbody.innerHTML = "";
    // New rules format: array of objects with one key (symbol), value is replacement, plus probability
    t.rules.forEach((rule) => {
      const symbol = Object.keys(rule).find((k) => k !== "probability");
      const replacement = rule[symbol];
      const probability = rule.probability;
      const row = document.createElement("tr");
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

  loadTemplate(0);

  templateButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const template = templates[button.dataset.template];
      if (template) {
        axiomInput.value = template.axiom;

        // Clear existing rules
        const tbody = rulesTable.querySelector("tbody");
        tbody.innerHTML = "";

        // Add new rules
        template.rules.forEach((rule) => {
          const row = document.createElement("tr");
          row.innerHTML = `
                        <td><input type="text" class="rule-symbol" value="${rule.symbol}" maxlength="1" style="width:2em;"></td>
                        <td><input type="text" class="rule-replacement" value="${rule.replacement}"></td>
                        <td><input type="number" class="rule-probability" value="${rule.probability}" min="0" max="1" step="0.01" style="width:4em;"></td>
                        <td><button type="button" class="remove-rule">&minus;</button></td>
                    `;
          tbody.appendChild(row);
        });

        generateTree();
      }
    });
  });

  // Add rule button
  addRuleButton.addEventListener("click", () => {
    const tbody = rulesTable.querySelector("tbody");
    const row = document.createElement("tr");
    row.innerHTML = `
            <td><input type="text" class="rule-symbol" value="F" maxlength="1" style="width:2em;"></td>
            <td><input type="text" class="rule-replacement" value="F"></td>
            <td><input type="number" class="rule-probability" value="1" min="0" max="1" step="0.01" style="width:4em;"></td>
            <td><button type="button" class="remove-rule">&minus;</button></td>
        `;
    tbody.appendChild(row);
  });

  // Remove rule button
  rulesTable.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-rule")) {
      e.target.closest("tr").remove();
      generateTree();
    }
  });

  // Event listeners
  generateButton.addEventListener("click", generateTree);
  randomizeButton.addEventListener("click", randomize);

  // Initial generation
  generateTree();
});
