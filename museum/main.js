// App shell: renderer, first-person pointer-lock controls, collision,
// proximity interaction, and fade transitions between halls. The building
// itself comes from floorplan.yaml via plan.js.
import * as THREE from "three";
import { buildLocation, disposeObject } from "./world.js";
import { loadPlan } from "./plan.js";
import { familyById } from "./specimens.js";
import { openFocus, decodeHash } from "./focus.js";
import { makeSwarm } from "./pollinators.js";

const app = document.getElementById("app");
const introEl = document.getElementById("intro");
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

const tickCtx = { renderer }; // handed to live specimens (GPU sims render with it)

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
// One hall's scene is live at a time; recently visited halls stay warm and
// the rest are evicted. Stateful special rooms (greenhouse, generations) and
// the entrance are pinned — evicting one would drop a run in progress.

let plan = null; // normalized floorplan.yaml, set at boot

const cache = new Map();
const CACHE_MAX = 8;

function hallLoc(id) {
  const hall = plan.halls.get(id);
  if (!hall) throw new Error("no hall in the floor plan: " + id);
  if (cache.has(id)) {
    const loc = cache.get(id);
    cache.delete(id);
    cache.set(id, loc); // refresh LRU order
    return loc;
  }
  const loc = buildLocation(hall);
  const area =
    (loc.bounds.maxX - loc.bounds.minX) * (loc.bounds.maxZ - loc.bounds.minZ);
  loc.swarm = makeSwarm(loc, { count: Math.max(12, Math.min(56, Math.round(area / 8))) });
  loc.scene.add(loc.swarm.mesh);
  cache.set(id, loc);
  evictStale();
  return loc;
}

function evictStale() {
  if (cache.size <= CACHE_MAX) return;
  for (const [id, loc] of cache) {
    if (cache.size <= CACHE_MAX) break;
    const kind = plan.halls.get(id).kind;
    if (id === plan.entranceId || kind === "greenhouse" || kind === "generations") continue;
    if (current && current.hallId === id) continue;
    disposeObject(loc.scene);
    cache.delete(id);
  }
}

// a hall's contents went stale (e.g. a seed was vaulted): rebuild on next entry
document.addEventListener("room-stale", (e) => {
  const id = e.detail && e.detail.id;
  const loc = cache.get(id);
  if (!loc) return;
  disposeObject(loc.scene);
  cache.delete(id);
});

// entering through a door spawns at the matching return door of the far hall
function arrive(id, fromId) {
  const loc = hallLoc(id);
  const back = fromId && loc.doorways.find((d) => d.to === fromId);
  return back ? { ...loc, spawn: back.spawn } : loc;
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
let relockTimer = null;

function requestLock() {
  clearTimeout(relockTimer);
  let p;
  try {
    p = canvas.requestPointerLock();
  } catch {
    return;
  }
  if (p && typeof p.catch === "function") {
    // Esc starts a browser cooldown (~1.3s) during which lock requests are
    // refused; retry once while the user's gesture activation is still fresh
    p.catch(() => {
      relockTimer = setTimeout(() => {
        try {
          const q = canvas.requestPointerLock();
          if (q && typeof q.catch === "function") q.catch(() => {});
        } catch {
          /* gesture expired: the resume pill stays up */
        }
      }, 1350);
    });
  }
}

function dismissIntro() {
  if (introEl) introEl.classList.add("hidden");
}
setTimeout(dismissIntro, 6500);

// unlocked mouse: drag looks around, a clean click captures
let dragging = false;
let dragDist = 0;
canvas.addEventListener("mousedown", (e) => {
  if (locked || e.button !== 0) return;
  dragging = true;
  dragDist = 0;
});
window.addEventListener("mouseup", () => {
  if (!dragging) return;
  dragging = false;
  if (dragDist < 5 && !document.body.classList.contains("focus-open") && !directoryOpen) requestLock();
});
resumeEl.addEventListener("click", (e) => {
  e.stopPropagation();
  requestLock();
});

document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  dragging = false;
  if (locked) {
    dismissIntro();
    resumeEl.classList.remove("show");
  } else {
    // released (usually Esc): the world stays live — drag looks, click recaptures
    if (!document.body.classList.contains("focus-open") && !directoryOpen) resumeEl.classList.add("show");
    setPrompt(null);
    crosshair.classList.remove("hot");
  }
});

document.addEventListener("mousemove", (e) => {
  if (locked) {
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
  } else if (dragging) {
    // grab-the-world: drag right to look left, like the focus canvas
    dragDist += Math.abs(e.movementX) + Math.abs(e.movementY);
    yaw += e.movementX * 0.0035;
    pitch += e.movementY * 0.0035;
  } else return;
  const lim = photo ? 1.5 : 1.2;
  pitch = Math.max(-lim, Math.min(lim, pitch));
});

// keys whose press means "I'm playing" — they also capture the mouse
// (a keydown carries the user gesture pointer lock needs)
const LOCK_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "KeyE", "Enter",
]);

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  const focusOpen = document.body.classList.contains("focus-open");
  if (focusOpen) return; // focus mode has its own key handling
  if (directoryOpen) {
    if (e.code === "Escape" || e.code === "KeyM") closeDirectory();
    return;
  }
  if (!locked && LOCK_KEYS.has(e.code)) requestLock();
  if (e.code === "KeyE" && current && !transitioning && !photo) tryInteract();
  if (e.code === "KeyF" && current && !transitioning && !photo && nearest) focusNearest();
  if (e.code === "Backspace" && current && plan && current.hallId !== plan.entranceId && !photo) {
    e.preventDefault();
    transitionTo(() => arrive(plan.entranceId, null));
  }
  if (e.code === "KeyM" && plan && !transitioning && !photo && !tour) openDirectory();
  if (e.code === "KeyP" && current && !transitioning && !tour) {
    photo ? exitPhoto() : enterPhoto();
  }
  if (e.code === "KeyT" && current && !transitioning && !photo) {
    tour ? exitTour() : enterTour();
  }
  if (e.code === "Space" && photo) e.preventDefault();
  if (e.code === "Escape" && photo) exitPhoto();
  if (e.code === "Escape" && tour) exitTour();
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

let nearest = null;

function tryInteract() {
  if (nearest && nearest.action) nearest.action(); // breeder pedestals and other in-room machinery
}

function focusNearest() {
  if (!nearest || !nearest.familyId) return;
  const fam = familyById(nearest.familyId);
  const vi = nearest.variantIndex || 0;
  const variant = fam.variations[vi];
  openFocus(fam, variant, { vi, onClose: () => requestLock() });
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
  for (const h of plan.order) {
    const btn = document.createElement("button");
    btn.className = "dir-card";
    btn.dataset.id = h.id;
    btn.style.setProperty("--c", h.accent);
    const count = h.kind === "gallery" ? h.exhibits.length + " exhibits" : h.kind;
    btn.innerHTML = `<span class="dir-name">${h.title}</span>
      <span class="dir-sub">${h.subtitle} · <span class="dir-count">${count}</span></span>`;
    btn.addEventListener("click", () => jumpTo(h.id));
    dirGrid.appendChild(btn);
  }
}

function openDirectory() {
  buildDirectory();
  const hereId = current ? current.hallId : plan.entranceId;
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
  requestLock(); // the closing gesture (click, M, Esc) doubles as the capture gesture
}

function jumpTo(id) {
  closeDirectory();
  transitionTo(() => arrive(id, null));
}

// open focus directly from a shared #exhibit=... link
function openFromHash() {
  const state = decodeHash(location.hash);
  if (!state) return false;
  const fam = familyById(state.id);
  if (!fam) return false;
  const vi = Number.isInteger(state.vi) ? state.vi : fam.heroIndex;
  const variant = fam.variations[vi] || fam.variations[fam.heroIndex];
  dismissIntro();
  openFocus(fam, variant, {
    vi,
    restore: { vals: state.vals, ax: state.ax, ru: state.ru },
    onClose: () => requestLock(),
  });
  return true;
}

// --- photo mode -----------------------------------------------------------

let photoBadgeT = null;
function showBadge(text) {
  photoBadge.textContent = text;
  photoBadge.classList.add("show");
  clearTimeout(photoBadgeT);
  photoBadgeT = setTimeout(() => photoBadge.classList.remove("show"), 3200);
}
function enterPhoto() {
  photo = true;
  document.body.classList.add("photo");
  showBadge("Photo mode · P exit · Space / C rise-fall · Shift boost");
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

// --- guided tour ----------------------------------------------------------

let tour = false;
let tourT = 0;
function enterTour() {
  tour = true;
  tourT = Math.atan2(player.x, player.z); // start near current heading
  document.body.classList.add("tour");
  showBadge("Touring · move or T to stop");
  setPrompt(null);
  crosshair.classList.remove("hot");
}
function exitTour() {
  tour = false;
  document.body.classList.remove("tour");
  photoBadge.classList.remove("show");
  velocity.set(0, 0, 0);
  if (!photo) player.y = 1.6;
}
function updateTour(dt) {
  if (
    keys["KeyW"] || keys["KeyA"] || keys["KeyS"] || keys["KeyD"] ||
    keys["ArrowUp"] || keys["ArrowDown"] || keys["ArrowLeft"] || keys["ArrowRight"] || keys["Space"]
  ) {
    exitTour();
    return;
  }
  tourT += dt * 0.12;
  const b = current.bounds;
  const R = Math.min(b.maxX, b.maxZ) * 0.82;
  player.x = Math.cos(tourT) * R;
  player.z = Math.sin(tourT) * R;
  player.y = 2.1;
  yaw = Math.atan2(-player.x, -player.z); // face the room centre
  pitch = -0.16;
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

  // wall bounds, except through door openings — stepping deep enough into an
  // opening crosses into the neighboring hall
  const b = current.bounds;
  const w = current.walls;
  const PASS = 0.3; // crossing fires this far before the wall plane
  const doorOn = (wall) => (current.doorways || []).find((d) => d.wall === wall);
  let through = null;

  if (player.z < b.minZ) {
    const d = doorOn("north");
    if (d && Math.abs(player.x) < d.half) {
      if (player.z < w.north + PASS) through = d;
    } else player.z = b.minZ;
  } else if (player.z > b.maxZ) {
    const d = doorOn("south");
    if (d && Math.abs(player.x) < d.half) {
      if (player.z > w.south - PASS) through = d;
    } else player.z = b.maxZ;
  }
  if (player.x < b.minX) {
    const d = doorOn("west");
    if (d && Math.abs(player.z) < d.half) {
      if (player.x < w.west + PASS) through = d;
    } else player.x = b.minX;
  } else if (player.x > b.maxX) {
    const d = doorOn("east");
    if (d && Math.abs(player.z) < d.half) {
      if (player.x > w.east - PASS) through = d;
    } else player.x = b.maxX;
  }

  if (through) {
    const from = current.hallId;
    const to = through.to;
    transitionTo(() => arrive(to, from));
    return;
  }

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
    const bits = [];
    if (best.action) bits.push(`<kbd>E</kbd> ${best.actionLabel || "activate"}`);
    if (best.familyId) bits.push(`<kbd>F</kbd> focus`);
    setPrompt(`${bits.join(" &nbsp;")} &nbsp;<b>${best.title}</b>`);
    crosshair.classList.add("hot");
  } else {
    let door = null;
    for (const d of current.doorways || []) {
      if (player.distanceTo(d.at) < 3.0) {
        door = d;
        break;
      }
    }
    setPrompt(door ? `walk through → <b>${door.label}</b>` : null);
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
    // the world runs whether or not the mouse is captured; only transitions
    // and the directory overlay pause it
    const active = !transitioning && !directoryOpen;
    if (active) {
      if (current.swarm) current.swarm.update(dt);
      for (const t of current.tickers || []) t.userData.tick(dt, tickCtx);
      if (current.animators && current.animators.length) {
        growthTime += dt;
        for (const a of current.animators) tickGrowth(a, growthTime);
      }
      if (tour) {
        updateTour(dt);
      } else {
        updateMovement(dt);
        updateInteraction();
      }
    } else {
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
  goHall: () => goTo(hallLoc(plan.entranceId)),
  goRoom: (id) => goTo(hallLoc(id)),
  door: (wall) => {
    const d = current && (current.doorways || []).find((x) => x.wall === wall);
    if (d) goTo(arrive(d.to, current.hallId));
    return d ? d.to : null;
  },
  plan: () => plan,
  view: (y, p, x, z) => {
    yaw = y;
    pitch = p;
    if (x != null) player.x = x;
    if (z != null) player.z = z;
    applyCameraOrientation();
  },
  pos: () => ({ x: player.x, z: player.z }),
  interact: (i) => {
    const it = current && current.interactables && current.interactables[i];
    if (it && it.action) it.action();
    return it ? it.title : null;
  },
  tick: (frames) => {
    for (let i = 0; i < (frames || 60); i++) {
      for (const t of (current && current.tickers) || []) t.userData.tick(1 / 60, tickCtx);
      if (current && current.swarm) current.swarm.update(1 / 60);
    }
  },
};

// boot: the floor plan is data, fetched before the first hall can exist
(async () => {
  try {
    plan = await loadPlan(new URL("./floorplan.yaml", import.meta.url));
    goTo(hallLoc(plan.entranceId));
    animate();
    openFromHash(); // if arriving via a shared #exhibit=... link, open focus
  } catch (e) {
    showError("Failed to build the museum: " + e.message);
    console.error(e);
  }
})();
