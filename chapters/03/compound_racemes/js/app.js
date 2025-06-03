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
    console.log("Using angle:", angle); // Debug log
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
      angle: 20,
      axiom: "a",
      patterns: [
        { name: "Stem", variable: "a", shape: "line", color: "#8B5A2B" },
        {
          name: "Branch Generator",
          variable: "A",
          shape: "line",
          color: "#8B5A2B",
        },
        { name: "Internode", variable: "I", shape: "line", color: "#B8860B" },
        { name: "Leaf", variable: "L", shape: "circle", color: "#228B22" },
        { name: "Flower", variable: "F", shape: "circle", color: "#FF0000" },
        { name: "branch", variable: "a", shape: "circle", color: "#228B22" },
        { name: "branching vine", variable: "A", shape: "circle", color: "#228B22" },
        { name: "End", variable: "b", shape: "circle", color: "#FFCC00" },
        { name: "Flower generator", variable: "B", shape: "line", color: "#8B5A2B" },
      ],
      rules: [
        // stem -> stem or branching stem
        { a: "I(1)[+IL(1)][-IL(1)]a", probability: .75}, 
        { a: "b(5)", probability: 1},

        // branching stem -> branching stem or flower vine
        { b: "I(1)[+Ic(5)]I[-Ic(5)]b(${0}-1)", probability: .75 },
        { b: "c(5)", probability: 0.25 },

        // flower vine -> flower vine or flowering branch
        { c: "I(1)[+IL]I(1)[-IL]c(${0}-1)", probability: 1, min: 1},
        { c: "d", probability: 1, min: 0},

        // flowering branch -> flowering branch or termination
        { d: "I(1)[+IF]I(1)[-IF]d", probability: 0.8 },
        { d: "I(1)[+IF]I(1)[-IF]e", probability: 0.2 },

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
    // Add rules to table
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
        angleInput.value = template.angle;
        angleValue.textContent = `${template.angle}°`;
        patterns = template.patterns || [];

        // Clear existing rules
        const tbody = rulesTable.querySelector("tbody");
        tbody.innerHTML = "";

        // Add new rules
        template.rules.forEach((rule) => {
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