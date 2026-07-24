// App shell: renderer, first-person pointer-lock controls, collision,
// proximity interaction, and fade transitions between the hall and rooms.
import * as THREE from "three";
import { buildHall, buildRoom, ACCENTS } from "./world.js";
import { familyById, FAMILIES } from "./specimens.js";
import { openFocus, decodeHash } from "./focus.js";

const app = document.getElementById("app");
const overlay = document.getElementById("overlay");
const fade = document.getElementById("fade");
const promptEl = document.getElementById("prompt");
const crosshair = document.getElementById("crosshair");
const locName = document.getElementById("loc-name");
const locSub = document.getElementById("loc-sub");
const errEl = document.getElementById("err");
const photoBadge = document.getElementById("photo-badge");

let renderer, camera;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  app.appendChild(renderer.domElement);
} catch (e) {
  showError("WebGL could not start: " + e.message);
  throw e;
}

camera = new THREE.PerspectiveCamera(
  68,
  window.innerWidth / window.innerHeight,
  0.05,
  120,
);

// --- bloom post-processing (optional; falls back to direct render) --------

let composer = null;
let renderPass = null;
(async () => {
  try {
    const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
    const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
    const { UnrealBloomPass } = await import("three/addons/postprocessing/UnrealBloomPass.js");
    composer = new EffectComposer(renderer);
    renderPass = new RenderPass(new THREE.Scene(), camera);
    composer.addPass(renderPass);
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5, // strength
      0.4, // radius
      0.82, // luminance threshold
    );
    composer.addPass(bloom);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  } catch (e) {
    console.warn("bloom unavailable, using direct render", e);
    composer = null;
  }
})();

function renderCurrent() {
  if (composer && renderPass) {
    renderPass.scene = current.scene;
    renderPass.camera = camera;
    composer.render();
  } else {
    renderer.render(current.scene, camera);
  }
}

// --- location cache -------------------------------------------------------

const cache = new Map();
function hall() {
  if (!cache.has("hall"))
    cache.set("hall", { ...buildHall(), name: "Grand Hall", sub: FAMILIES.length + " specimens" });
  return cache.get("hall");
}
function room(id) {
  const key = "room:" + id;
  if (!cache.has(key)) {
    const fam = familyById(id);
    const built = buildRoom(fam);
    cache.set(key, {
      ...built,
      name: fam.title,
      sub: fam.variations.length + " permutations",
      familyId: id,
    });
  }
  return cache.get(key);
}

let current = null;

function goTo(loc) {
  current = loc;
  const s = loc.spawn;
  yaw = s.yaw;
  pitch = 0;
  player.set(s.pos.x, s.pos.y, s.pos.z);
  velocity.set(0, 0, 0);
  locName.textContent = loc.name;
  locSub.textContent = loc.sub;
  applyCameraOrientation();
}

let transitioning = false;
function transitionTo(locFactory) {
  if (transitioning) return;
  transitioning = true;
  fade.classList.add("on");
  setTimeout(() => {
    goTo(locFactory());
    setTimeout(() => {
      fade.classList.remove("on");
      transitioning = false;
    }, 60);
  }, 360);
}

// --- player / controls ----------------------------------------------------

const player = new THREE.Vector3(0, 1.6, 8);
const velocity = new THREE.Vector3();
let yaw = Math.PI;
let pitch = 0;
const keys = {};
let locked = false;
let photo = false;

function applyCameraOrientation() {
  camera.position.copy(player);
  const dir = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  );
  camera.lookAt(player.x + dir.x, player.y + dir.y, player.z + dir.z);
}

const canvas = renderer.domElement;
const resumeEl = document.getElementById("resume");
let started = false;

function requestLock() {
  const p = canvas.requestPointerLock();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

overlay.addEventListener("click", () => {
  started = true;
  requestLock();
});
resumeEl.addEventListener("click", (e) => {
  e.stopPropagation();
  requestLock();
});

document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  if (locked) {
    // engaged: hide both the start overlay and the resume pill
    overlay.classList.add("hidden");
    resumeEl.classList.remove("show");
  } else if (started) {
    // released mid-session: keep the scene visible, just offer a way back
    overlay.classList.add("hidden");
    resumeEl.classList.add("show");
    setPrompt(null);
    crosshair.classList.remove("hot");
  } else {
    // never started yet: show the full entry overlay
    overlay.classList.remove("hidden");
    resumeEl.classList.remove("show");
  }
});

// Enter also resumes when the cursor is free
window.addEventListener("keydown", (e) => {
  if (e.code === "Enter" && started && !locked) requestLock();
});

document.addEventListener("mousemove", (e) => {
  if (!locked) return;
  yaw -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  const lim = photo ? 1.5 : 1.2;
  pitch = Math.max(-lim, Math.min(lim, pitch));
});

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  const focusOpen = document.body.classList.contains("focus-open");
  if (focusOpen) return; // focus mode has its own key handling
  if (e.code === "KeyE" && locked && !transitioning && !photo) tryInteract();
  if (e.code === "KeyF" && locked && !transitioning && !photo && nearest) focusNearest();
  if (e.code === "Backspace" && locked && current && current.familyId && !photo) {
    e.preventDefault();
    transitionTo(hall);
  }
  if (e.code === "KeyM" && started && !transitioning && !photo) {
    directoryOpen ? closeDirectory() : openDirectory();
  }
  if (e.code === "KeyP" && locked && !transitioning && !directoryOpen) {
    photo ? exitPhoto() : enterPhoto();
  }
  if (e.code === "Space" && photo) e.preventDefault();
  if (e.code === "Escape" && directoryOpen) closeDirectory();
  if (e.code === "Escape" && photo) exitPhoto();
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

let nearest = null;

function tryInteract() {
  if (current && current.familyId) {
    transitionTo(hall); // any E inside a room returns to the hall
    return;
  }
  if (nearest && nearest.enterId) {
    const id = nearest.enterId;
    transitionTo(() => room(id));
  }
}

function focusNearest() {
  if (!nearest || !nearest.familyId) return;
  const fam = familyById(nearest.familyId);
  const vi = nearest.variantIndex || 0;
  const variant = fam.variations[vi];
  openFocus(fam, variant, { vi, onClose: () => {} });
  document.exitPointerLock();
}

// --- directory / room map -------------------------------------------------

const dirEl = document.getElementById("directory");
const dirGrid = document.getElementById("dir-grid");
let directoryOpen = false;
let dirBuilt = false;

function buildDirectory() {
  if (dirBuilt) return;
  dirBuilt = true;
  const cards = [
    { id: "hall", name: "Grand Hall", sub: "all rooms", count: FAMILIES.length + " specimens", accent: "#9bd88a" },
    ...FAMILIES.map((f) => ({
      id: f.id,
      name: f.title,
      sub: f.subtitle,
      count: f.variations.length + " permutations",
      accent: ACCENTS[f.id] || "#6fbf59",
    })),
  ];
  for (const c of cards) {
    const btn = document.createElement("button");
    btn.className = "dir-card";
    btn.dataset.id = c.id;
    btn.style.setProperty("--c", c.accent);
    btn.innerHTML = `<span class="dir-name">${c.name}</span>
      <span class="dir-sub">${c.sub} · <span class="dir-count">${c.count}</span></span>`;
    btn.addEventListener("click", () => jumpTo(c.id));
    dirGrid.appendChild(btn);
  }
}

function openDirectory() {
  buildDirectory();
  const hereId = current && current.familyId ? current.familyId : "hall";
  dirGrid.querySelectorAll(".dir-card").forEach((b) => b.classList.toggle("here", b.dataset.id === hereId));
  document.body.classList.add("dir-open");
  dirEl.classList.remove("hidden");
  directoryOpen = true;
  document.exitPointerLock();
}

function closeDirectory() {
  directoryOpen = false;
  dirEl.classList.add("hidden");
  document.body.classList.remove("dir-open");
}

function jumpTo(id) {
  closeDirectory();
  if (id === "hall") transitionTo(hall);
  else transitionTo(() => room(id));
  requestLock();
}

// open focus directly from a shared #exhibit=... link
function openFromHash() {
  const state = decodeHash(location.hash);
  if (!state) return false;
  const fam = familyById(state.id);
  if (!fam) return false;
  const vi = Number.isInteger(state.vi) ? state.vi : fam.heroIndex;
  const variant = fam.variations[vi] || fam.variations[fam.heroIndex];
  started = true;
  overlay.classList.add("hidden");
  openFocus(fam, variant, {
    vi,
    restore: { vals: state.vals, ax: state.ax, ru: state.ru },
    onClose: () => {},
  });
  return true;
}

// --- photo mode -----------------------------------------------------------

let photoBadgeT = null;
function enterPhoto() {
  photo = true;
  document.body.classList.add("photo");
  photoBadge.classList.add("show");
  clearTimeout(photoBadgeT);
  photoBadgeT = setTimeout(() => photoBadge.classList.remove("show"), 3200);
  setPrompt(null);
  crosshair.classList.remove("hot");
}
function exitPhoto() {
  photo = false;
  document.body.classList.remove("photo");
  photoBadge.classList.remove("show");
  if (current) {
    const b = current.bounds;
    player.x = Math.max(b.minX, Math.min(b.maxX, player.x));
    player.z = Math.max(b.minZ, Math.min(b.maxZ, player.z));
  }
  player.y = 1.6;
  velocity.set(0, 0, 0);
}

// --- movement & collision -------------------------------------------------

const PLAYER_R = 0.4;

function updateMovement(dt) {
  if (photo) return updateFreeFly(dt);
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  // right = forward × up (up = +Y)
  const rightV = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
  const wish = new THREE.Vector3();
  if (keys["KeyW"] || keys["ArrowUp"]) wish.add(forward);
  if (keys["KeyS"] || keys["ArrowDown"]) wish.sub(forward);
  if (keys["KeyD"] || keys["ArrowRight"]) wish.add(rightV);
  if (keys["KeyA"] || keys["ArrowLeft"]) wish.sub(rightV);
  const running = keys["ShiftLeft"] || keys["ShiftRight"];
  const speed = running ? 7.5 : 4.0;
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

  // smooth toward wish velocity
  velocity.x += (wish.x - velocity.x) * Math.min(1, dt * 12);
  velocity.z += (wish.z - velocity.z) * Math.min(1, dt * 12);

  player.x += velocity.x * dt;
  player.z += velocity.z * dt;

  if (!current) return;

  // wall bounds
  const b = current.bounds;
  player.x = Math.max(b.minX, Math.min(b.maxX, player.x));
  player.z = Math.max(b.minZ, Math.min(b.maxZ, player.z));

  // pedestal colliders (push out of circles)
  for (const c of current.colliders) {
    const dx = player.x - c.x;
    const dz = player.z - c.z;
    const d = Math.hypot(dx, dz);
    const minD = c.r + PLAYER_R;
    if (d < minD && d > 1e-4) {
      const push = (minD - d) / d;
      player.x += dx * push;
      player.z += dz * push;
    }
  }
  player.y = 1.6;
}

// Free-fly camera for photo mode: full 3D movement, no collision, rise/fall.
function updateFreeFly(dt) {
  const cp = Math.cos(pitch);
  const look = new THREE.Vector3(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
  const rightV = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
  const wish = new THREE.Vector3();
  if (keys["KeyW"] || keys["ArrowUp"]) wish.add(look);
  if (keys["KeyS"] || keys["ArrowDown"]) wish.sub(look);
  if (keys["KeyD"] || keys["ArrowRight"]) wish.add(rightV);
  if (keys["KeyA"] || keys["ArrowLeft"]) wish.sub(rightV);
  if (keys["Space"]) wish.y += 1;
  if (keys["KeyC"]) wish.y -= 1;
  const speed = keys["ShiftLeft"] || keys["ShiftRight"] ? 12 : 5;
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
  const k = Math.min(1, dt * 10);
  velocity.x += (wish.x - velocity.x) * k;
  velocity.y += (wish.y - velocity.y) * k;
  velocity.z += (wish.z - velocity.z) * k;
  player.addScaledVector(velocity, dt);
  if (current) {
    const b = current.bounds;
    const M = 6; // let the camera drift a little past the walls
    player.x = Math.max(b.minX - M, Math.min(b.maxX + M, player.x));
    player.z = Math.max(b.minZ - M, Math.min(b.maxZ + M, player.z));
  }
  player.y = Math.max(0.2, Math.min(8, player.y));
}

// --- interaction proximity ------------------------------------------------

const viewDir = new THREE.Vector3();
const toTarget = new THREE.Vector3();

function updateInteraction() {
  if (!current) return;
  const inRoom = !!current.familyId;

  camera.getWorldDirection(viewDir);
  let best = null;
  let bestScore = -Infinity;
  for (const it of current.interactables || []) {
    toTarget.copy(it.focus).sub(player);
    const dist = toTarget.length();
    if (dist > 4.0) {
      if (it.ring) it.ring.material.opacity = 0;
      continue;
    }
    toTarget.normalize();
    const facing = toTarget.dot(viewDir);
    const score = facing - dist * 0.15;
    if (it.ring) it.ring.material.opacity = Math.max(0, 0.55 * (1 - dist / 4.0));
    if (facing > 0.35 && score > bestScore) {
      bestScore = score;
      best = it;
    }
  }
  nearest = best;

  if (best) {
    if (best.ring) best.ring.material.opacity = 0.85;
    const action = best.enterId
      ? `<kbd>E</kbd> enter &nbsp;<kbd>F</kbd> focus &nbsp;<b>${best.title}</b>`
      : `<kbd>F</kbd> focus &nbsp;<b>${best.title}</b>`;
    setPrompt(action);
    crosshair.classList.add("hot");
  } else if (inRoom) {
    setPrompt("<kbd>E</kbd> return to the Grand Hall");
    crosshair.classList.remove("hot");
  } else {
    setPrompt(null);
    crosshair.classList.remove("hot");
  }
}

function setPrompt(html) {
  if (!html) {
    promptEl.classList.remove("show");
    return;
  }
  promptEl.innerHTML = html;
  promptEl.classList.add("show");
}

// --- loop -----------------------------------------------------------------

const clock = new THREE.Clock();
let growthTime = 0;

// Reveal one developmental stage at a time: grow 0..count-1, hold at full for
// `hold` extra slots, then loop back to the start.
function updateMotes(pts, dt) {
  const a = pts.geometry.attributes.position.array;
  const { vel, halfX, halfZ, yMin, yMax } = pts.userData;
  for (let i = 0; i < a.length; i += 3) {
    a[i] += vel[i] * dt;
    a[i + 1] += vel[i + 1] * dt;
    a[i + 2] += vel[i + 2] * dt;
    if (a[i] > halfX) a[i] = -halfX;
    else if (a[i] < -halfX) a[i] = halfX;
    if (a[i + 2] > halfZ) a[i + 2] = -halfZ;
    else if (a[i + 2] < -halfZ) a[i + 2] = halfZ;
    if (a[i + 1] > yMax) a[i + 1] = yMin;
    else if (a[i + 1] < yMin) a[i + 1] = yMax;
  }
  pts.geometry.attributes.position.needsUpdate = true;
}

function tickGrowth(parent, t) {
  const g = parent.userData.growth;
  const slots = g.count + g.hold;
  const phase = Math.floor((t / g.period) % slots);
  const idx = Math.min(phase, g.count - 1);
  if (parent.userData._idx !== idx) {
    parent.children.forEach((c, i) => (c.visible = i === idx));
    parent.userData._idx = idx;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // focus mode owns the screen and its own render loop
  if (document.body.classList.contains("focus-open")) return;

  if (current) {
    const active = locked && !transitioning;
    if (active) {
      for (const s of current.spinners) s.rotation.y += dt * 0.22;
      if (current.animators && current.animators.length) {
        growthTime += dt;
        for (const a of current.animators) tickGrowth(a, growthTime);
      }
      if (current.motes) updateMotes(current.motes, dt);
      updateMovement(dt);
      updateInteraction();
    } else {
      // paused (cursor released): hold the scene still for screenshots
      setPrompt(null);
      crosshair.classList.remove("hot");
    }
    applyCameraOrientation();
    renderCurrent();
  }
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

function showError(msg) {
  errEl.style.display = "flex";
  errEl.textContent = msg;
}

// debug hook (used by the headless smoke test; harmless in production)
window.__museum = {
  goHall: () => goTo(hall()),
  goRoom: (id) => goTo(room(id)),
  view: (y, p, x, z) => {
    yaw = y;
    pitch = p;
    if (x != null) player.x = x;
    if (z != null) player.z = z;
    applyCameraOrientation();
  },
  pos: () => ({ x: player.x, z: player.z }),
};

// boot
try {
  goTo(hall());
  animate();
  openFromHash(); // if arriving via a shared #exhibit=... link, open focus
} catch (e) {
  showError("Failed to build the museum: " + e.message);
  console.error(e);
}
