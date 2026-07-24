// Focus mode: a locked "specimen bench" view. Left panel = description +
// editable controls (sliders / grammar) + export; right = a live 3D render of
// the specimen that rebuilds as you tweak. Owns its own renderer/scene.
import * as THREE from "three";
import { cloneVariant } from "./specimens.js";

const el = {
  root: document.getElementById("focus"),
  canvas: document.getElementById("focus-canvas"),
  sub: document.getElementById("focus-sub"),
  title: document.getElementById("focus-title"),
  blurb: document.getElementById("focus-blurb"),
  controls: document.getElementById("focus-controls"),
  grammar: document.getElementById("focus-grammar"),
  close: document.getElementById("focus-close"),
  copy: document.getElementById("focus-copy"),
  download: document.getElementById("focus-download"),
  reset: document.getElementById("focus-reset"),
  random: document.getElementById("focus-random"),
  toast: document.getElementById("focus-toast"),
};

let renderer, scene, camera, keyLight;
let obj = null;
let raf = null;
let open = false;

let family = null;
let base = null; // pristine base variant
let variantIndex = 0;
let controlValues = {};
let grammar = false;
let grammarState = { axiom: "", rules: {} };
let onCloseCb = null;

// camera orbit
let yaw = 0.7,
  pitch = 0.22,
  dist = 6,
  autoYaw = true,
  dragging = false,
  lastX = 0,
  lastY = 0;

let dirty = false;
let lastTime = 0;
let growthTime = 0;

// --- path helpers ---------------------------------------------------------
function getByPath(o, p) {
  return p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
}
function setByPath(o, p, val) {
  const ks = p.split(".");
  let t = o;
  for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]];
  t[ks[ks.length - 1]] = val;
}

function ensureRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({
    canvas: el.canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xbfd0ff, 0x2a2620, 0.95));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  keyLight = new THREE.DirectionalLight(0xfff2df, 1.4);
  keyLight.position.set(3, 5, 6);
  scene.add(keyLight);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);

  // drag to orbit
  el.canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    autoYaw = false;
    lastX = e.clientX;
    lastY = e.clientY;
    el.canvas.setPointerCapture(e.pointerId);
  });
  el.canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    yaw -= (e.clientX - lastX) * 0.01;
    pitch += (e.clientY - lastY) * 0.01;
    pitch = Math.max(-1.4, Math.min(1.4, pitch));
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const stop = () => (dragging = false);
  el.canvas.addEventListener("pointerup", stop);
  el.canvas.addEventListener("pointerleave", stop);
  el.canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      dist *= e.deltaY > 0 ? 1.1 : 0.9;
      dist = Math.max(1, Math.min(40, dist));
    },
    { passive: false },
  );
}

function resize() {
  if (!renderer) return;
  const r = el.canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(r.height, 1);
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

function controlsFor(v) {
  return typeof family.controls === "function" ? family.controls(v) : family.controls || [];
}

function composeVariant() {
  const v = cloneVariant(base);
  for (const [path, val] of Object.entries(controlValues)) {
    try {
      setByPath(v, path, val);
    } catch {
      /* path not present on this variant */
    }
  }
  if (grammar) {
    v.axiom = grammarState.axiom;
    v.rules = { ...grammarState.rules };
  }
  return v;
}

function rebuild(recenter) {
  let built;
  try {
    built = family.make(composeVariant());
  } catch (e) {
    flash("build error — check the grammar");
    return;
  }
  if (obj) {
    scene.remove(obj);
    disposeTree(obj);
  }
  obj = built;
  // center at origin
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.sub(center);
  scene.add(obj);
  if (recenter) {
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.5);
    dist = maxDim * 2.3;
  }
}

function disposeTree(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) {
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach((m) => m.dispose());
    }
  });
}

// --- panel UI -------------------------------------------------------------
function buildPanel() {
  el.sub.textContent = family.subtitle;
  el.title.textContent = family.title;
  el.blurb.textContent = family.blurb;

  // numeric controls
  el.controls.innerHTML = '<div class="focus-section-title">Parameters</div>';
  for (const c of controlsFor(base)) {
    const cur = controlValues[c.path];
    const row = document.createElement("div");
    row.className = "ctrl";
    const isInt = c.step >= 1;
    row.innerHTML = `<label>${c.label}<span class="val">${fmt(cur, isInt)}</span></label>
      <input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${cur}">`;
    const input = row.querySelector("input");
    const valEl = row.querySelector(".val");
    input.addEventListener("input", () => {
      const val = parseFloat(input.value);
      controlValues[c.path] = val;
      valEl.textContent = fmt(val, isInt);
      dirty = true;
    });
    el.controls.appendChild(row);
  }

  // grammar editor
  el.grammar.innerHTML = "";
  if (grammar) {
    el.grammar.innerHTML = '<div class="focus-section-title">Grammar</div>';
    const ax = document.createElement("div");
    ax.className = "ctrl";
    ax.innerHTML = `<label>Axiom</label><input type="text" value="${escapeAttr(grammarState.axiom)}">`;
    ax.querySelector("input").addEventListener("input", (e) => {
      grammarState.axiom = e.target.value;
      dirty = true;
    });
    el.grammar.appendChild(ax);

    const wrap = document.createElement("div");
    wrap.className = "ctrl";
    for (const sym of Object.keys(grammarState.rules)) {
      if (grammarState.rules[sym] === sym) continue; // hide identity rules
      const rr = document.createElement("div");
      rr.className = "rule-row";
      rr.innerHTML = `<span class="sym">${sym}</span><span class="arrow">→</span>
        <input type="text" value="${escapeAttr(grammarState.rules[sym])}">`;
      rr.querySelector("input").addEventListener("input", (e) => {
        grammarState.rules[sym] = e.target.value;
        dirty = true;
      });
      wrap.appendChild(rr);
    }
    el.grammar.appendChild(wrap);
  }
}

function fmt(x, isInt) {
  if (x == null) return "—";
  return isInt ? String(Math.round(x)) : (+x).toFixed(x < 1 ? 3 : 1);
}
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

let toastT = null;
function flash(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.toast.classList.remove("show"), 1600);
}

// --- open / close ---------------------------------------------------------
export function openFocus(fam, baseVariant, opts = {}) {
  ensureRenderer();
  family = fam;
  base = baseVariant;
  variantIndex = opts.vi || 0;
  onCloseCb = opts.onClose || null;
  autoYaw = true;
  yaw = 0.7;
  pitch = 0.22;
  growthTime = 0;

  // init control values from the base variant
  controlValues = {};
  for (const c of controlsFor(base)) {
    const v = getByPath(base, c.path);
    if (v != null) controlValues[c.path] = v;
  }
  grammar = !!fam.grammar && !Array.isArray(base.rules);
  grammarState = {
    axiom: base.axiom || "",
    rules: grammar ? { ...base.rules } : {},
  };

  // restore from a shared link
  if (opts.restore) {
    if (opts.restore.vals) Object.assign(controlValues, opts.restore.vals);
    if (opts.restore.ax != null) grammarState.axiom = opts.restore.ax;
    if (opts.restore.ru) grammarState.rules = { ...grammarState.rules, ...opts.restore.ru };
  }

  buildPanel();
  document.body.classList.add("focus-open");
  el.root.classList.remove("hidden");
  open = true;
  requestAnimationFrame(() => {
    resize();
    rebuild(true);
  });
  if (!raf) raf = requestAnimationFrame(loop);
  updateHash();
}

export function closeFocus() {
  if (!open) return;
  open = false;
  el.root.classList.add("hidden");
  document.body.classList.remove("focus-open");
  if (obj) {
    scene.remove(obj);
    disposeTree(obj);
    obj = null;
  }
  if (raf) {
    cancelAnimationFrame(raf);
    raf = null;
  }
  if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
  const cb = onCloseCb;
  onCloseCb = null;
  if (cb) cb();
}

function loop(t) {
  raf = requestAnimationFrame(loop);
  const dt = lastTime ? Math.min((t - lastTime) / 1000, 0.05) : 0;
  lastTime = t;
  if (dirty) {
    dirty = false;
    rebuild(false);
  }
  if (autoYaw) yaw += dt * 0.3;
  if (obj && obj.userData.growth) {
    growthTime += dt;
    tickGrowth(obj, growthTime);
  }
  camera.position.set(
    dist * Math.cos(pitch) * Math.sin(yaw),
    dist * Math.sin(pitch),
    dist * Math.cos(pitch) * Math.cos(yaw),
  );
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
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

// --- share / export -------------------------------------------------------
function currentState() {
  const state = { id: family.id, vi: variantIndex, vals: controlValues };
  if (grammar) {
    state.ax = grammarState.axiom;
    const ru = {};
    for (const k of Object.keys(grammarState.rules)) {
      if (grammarState.rules[k] !== base.rules[k]) ru[k] = grammarState.rules[k];
    }
    if (Object.keys(ru).length) state.ru = ru;
  }
  return state;
}

function updateHash() {
  const enc = encodeURIComponent(JSON.stringify(currentState()));
  if (history.replaceState) history.replaceState(null, "", "#exhibit=" + enc);
}

export function decodeHash(hash) {
  const m = /[#&]exhibit=([^&]+)/.exec(hash || "");
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}

el.close.addEventListener("click", closeFocus);
window.addEventListener("keydown", (e) => {
  if (open && (e.code === "Escape" || e.code === "KeyF")) {
    e.preventDefault();
    closeFocus();
  }
});
el.copy.addEventListener("click", async () => {
  updateHash();
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    flash("link copied to clipboard");
  } catch {
    flash("copy failed — URL is in the address bar");
  }
});
el.download.addEventListener("click", () => {
  renderer.render(scene, camera);
  const a = document.createElement("a");
  a.download = `${family.id}-specimen.png`;
  a.href = el.canvas.toDataURL("image/png");
  a.click();
  flash("image downloaded");
});
el.reset.addEventListener("click", () => {
  controlValues = {};
  for (const c of controlsFor(base)) {
    const v = getByPath(base, c.path);
    if (v != null) controlValues[c.path] = v;
  }
  grammarState = { axiom: base.axiom || "", rules: grammar ? { ...base.rules } : {} };
  buildPanel();
  dirty = true;
  updateHash();
});
el.random.addEventListener("click", () => {
  for (const c of controlsFor(base)) {
    const steps = Math.max(1, Math.floor((c.max - c.min) / c.step));
    const n = Math.floor(Math.random() * (steps + 1));
    controlValues[c.path] = +(c.min + n * c.step).toFixed(6);
  }
  buildPanel();
  dirty = true;
  updateHash();
  flash("randomized");
});
