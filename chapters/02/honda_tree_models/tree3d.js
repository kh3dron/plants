import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.155.0/examples/jsm/controls/OrbitControls.js';

// Load templates
async function loadTemplates() {
  const resp = await fetch('../templates.json');
  return resp.json();
}

function parseParamExpr(expr, params) {
  // e.g. "l*r1" or "w*wr" or "1*l1"
  return Function(...Object.keys(params), `return ${expr}`)(...Object.values(params));
}

function applyRule(str, rules, params) {
  for (const rule of rules) {
    const regex = new RegExp(rule.predecessor.replace(/([()])/g, '\\$1').replace(/([a-zA-Z_][a-zA-Z0-9_]*)/g, '([\\d.eE+-]+)'), 'g');
    str = str.replace(regex, (...args) => {
      let vars = {};
      let matchVars = rule.predecessor.match(/([a-zA-Z_][a-zA-Z0-9_]*)/g) || [];
      matchVars.forEach((v, i) => vars[v] = parseFloat(args[i+1]));
      let allParams = { ...params, ...vars };
      let out = rule.successor.replace(/([a-zA-Z_][a-zA-Z0-9_]*)(\*[^)]+)?/g, (m, v, expr) => {
        if (expr) {
          return parseParamExpr(expr.slice(1), allParams);
        } else if (allParams[v] !== undefined) {
          return allParams[v];
        }
        return m;
      });
      return out;
    });
  }
  return str;
}

function expandLSystem(axiom, rules, params, iterations) {
  let str = axiom;
  for (let i = 0; i < iterations; ++i) {
    str = applyRule(str, rules, params);
  }
  return str;
}

function parseLSystemString(str) {
  // Tokenize the string into commands and parameters
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    let c = str[i];
    if (/[A-Za-z!&+\-\/\[\]()]/.test(c)) {
      let cmd = c;
      let param = null;
      if (str[i+1] === '(') {
        let j = i+2, depth = 1;
        while (j < str.length && depth > 0) {
          if (str[j] === '(') depth++;
          else if (str[j] === ')') depth--;
          j++;
        }
        param = str.slice(i+2, j-1);
        i = j-1;
      }
      tokens.push({ cmd, param });
    }
    i++;
  }
  return tokens;
}

function buildTreeGeometry(tokens, angle, params) {
  // 3D turtle interpretation
  const group = new THREE.Group();
  let stack = [];
  let pos = new THREE.Vector3(0, 0, 0);
  let dir = new THREE.Vector3(0, 1, 0);
  let up = new THREE.Vector3(0, 0, 1);
  let right = new THREE.Vector3(1, 0, 0);
  let width = 1;
  let mat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B });
  let geoCache = {};

  function drawSegment(length, w) {
    let key = `${length}_${w}`;
    if (!geoCache[key]) {
      geoCache[key] = new THREE.CylinderGeometry(w, w, length, 8);
    }
    let mesh = new THREE.Mesh(geoCache[key], mat);
    mesh.position.copy(pos).addScaledVector(dir, length/2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
    group.add(mesh);
    pos.addScaledVector(dir, length);
  }

  for (let i = 0; i < tokens.length; ++i) {
    const { cmd, param } = tokens[i];
    switch (cmd) {
      case 'F': {
        let len = param ? parseFloat(param) : 1;
        drawSegment(len, width);
        break;
      }
      case '!': {
        width = param ? parseFloat(param) : width;
        break;
      }
      case '+': {
        let a = param ? parseFloat(param) : angle;
        dir.applyAxisAngle(up, THREE.MathUtils.degToRad(a));
        right.applyAxisAngle(up, THREE.MathUtils.degToRad(a));
        break;
      }
      case '-': {
        let a = param ? parseFloat(param) : angle;
        dir.applyAxisAngle(up, -THREE.MathUtils.degToRad(a));
        right.applyAxisAngle(up, -THREE.MathUtils.degToRad(a));
        break;
      }
      case '&': {
        let a = param ? parseFloat(param) : angle;
        dir.applyAxisAngle(right, THREE.MathUtils.degToRad(a));
        up.applyAxisAngle(right, THREE.MathUtils.degToRad(a));
        break;
      }
      case '^': {
        let a = param ? parseFloat(param) : angle;
        dir.applyAxisAngle(right, -THREE.MathUtils.degToRad(a));
        up.applyAxisAngle(right, -THREE.MathUtils.degToRad(a));
        break;
      }
      case '/': {
        let a = param ? parseFloat(param) : angle;
        right.applyAxisAngle(dir, THREE.MathUtils.degToRad(a));
        up.applyAxisAngle(dir, THREE.MathUtils.degToRad(a));
        break;
      }
      case '\\': {
        let a = param ? parseFloat(param) : angle;
        right.applyAxisAngle(dir, -THREE.MathUtils.degToRad(a));
        up.applyAxisAngle(dir, -THREE.MathUtils.degToRad(a));
        break;
      }
      case '[': {
        stack.push({ pos: pos.clone(), dir: dir.clone(), up: up.clone(), right: right.clone(), width });
        break;
      }
      case ']': {
        let state = stack.pop();
        pos.copy(state.pos);
        dir.copy(state.dir);
        up.copy(state.up);
        right.copy(state.right);
        width = state.width;
        break;
      }
    }
  }
  return group;
}

function clearScene(scene) {
  while(scene.children.length > 0){ 
    scene.remove(scene.children[0]); 
  }
}

async function main() {
  const container = document.getElementById('container');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f8ff);
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(0, -80, 60);
  camera.lookAt(0,0,0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 20, 0);
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight.position.set(50, 50, 100);
  scene.add(dirLight);

  // UI
  const templateSelect = document.getElementById('template-select');
  const iterationsInput = document.getElementById('iterations');
  const generateBtn = document.getElementById('generate-btn');
  const resetCameraBtn = document.getElementById('reset-camera-btn');

  // Load templates
  const templates = await loadTemplates();
  templates.forEach((tpl, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = tpl.name;
    templateSelect.appendChild(opt);
  });

  let treeObj = null;
  function generateTree() {
    const tpl = templates[templateSelect.value];
    const iterations = parseInt(iterationsInput.value);
    const lsysStr = expandLSystem(tpl.axiom, tpl.rules, tpl.parameters, iterations);
    const tokens = parseLSystemString(lsysStr);
    if (treeObj) scene.remove(treeObj);
    treeObj = buildTreeGeometry(tokens, tpl.angle, tpl.parameters);
    scene.add(treeObj);
  }

  generateBtn.addEventListener('click', generateTree);
  templateSelect.addEventListener('change', generateTree);
  iterationsInput.addEventListener('change', generateTree);
  resetCameraBtn.addEventListener('click', () => {
    camera.position.set(0, -80, 60);
    controls.target.set(0, 20, 0);
    controls.update();
  });

  generateTree();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
}

main();
