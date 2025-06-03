// Initialize the application

// Vogel Sunflower Pattern Generator
document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("treeCanvas");
  // Make canvas fit the available screen size with normal aspect ratio
  function resizeCanvas() {
    // Use a max width and height, but fit to window
    const maxWidth = Math.min(window.innerWidth * 0.9, 800);
    const maxHeight = Math.min(window.innerHeight * 0.7, 600);
    canvas.width = maxWidth;
    canvas.height = maxHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    generateSunflower();
  });
  const ctx = canvas.getContext("2d");

  // UI elements (adjust as needed for your HTML)
  const seedsInput = document.getElementById("seeds") || document.getElementById("iterations");
  const seedsValue = document.getElementById("seeds-value") || document.getElementById("iterations-value");
  const sizeInput = document.getElementById("size");
  const sizeValue = document.getElementById("size-value");
  const generateButton = document.getElementById("generate");
  const randomizeButton = document.getElementById("randomize");

  // Default values
  const GOLDEN_ANGLE = 137.5 * Math.PI / 180; // radians
  const DEFAULT_SEEDS = 200;
  const DEFAULT_SIZE = 6;

  // Update display values
  if (seedsInput && seedsValue) {
    seedsInput.addEventListener("input", () => {
      seedsValue.textContent = seedsInput.value;
      generateSunflower();
    });
  }
  if (sizeInput && sizeValue) {
    sizeInput.addEventListener("input", () => {
      sizeValue.textContent = sizeInput.value;
      generateSunflower();
    });
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Main sunflower/fractal generation
  function generateSunflower() {
    clearCanvas();
    const N = parseInt(seedsInput ? seedsInput.value : DEFAULT_SEEDS) || DEFAULT_SEEDS;
    const circleSize = parseFloat(sizeInput ? sizeInput.value : DEFAULT_SIZE) || DEFAULT_SIZE;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    for (let n = 0; n < N; n++) {
      const angle = n * GOLDEN_ANGLE;
      const radius = Math.sqrt(n) * 10; // 10 is a scaling factor
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(x, y, circleSize, 0, 2 * Math.PI);
      ctx.fillStyle = "#FFCC00";
      ctx.fill();
    }
  }

  // Randomize function
  function randomize() {
    if (seedsInput) {
      const randomSeeds = Math.floor(Math.random() * 400) + 100; // 100-500
      seedsInput.value = randomSeeds;
      if (seedsValue) seedsValue.textContent = randomSeeds;
    }
    if (sizeInput) {
      const randomSize = Math.random() * 8 + 2; // 2-10
      sizeInput.value = randomSize.toFixed(1);
      if (sizeValue) sizeValue.textContent = randomSize.toFixed(1);
    }
    generateSunflower();
  }

  if (generateButton) generateButton.addEventListener("click", generateSunflower);
  if (randomizeButton) randomizeButton.addEventListener("click", randomize);

  // Initial generation
  generateSunflower();
});
