// Flat catalog page: one hall per page (hash-routed), a plate per exhibit, and
// a detail page per exhibit with editable parameters, grammar, and export.
import * as THREE from "three";
import { familyById, cloneVariant } from "./specimens.js";
import {
  getGeneration,
  getParentGenome,
  rerollBrood,
  selectOffspring,
  reseedLineage,
  syncVariations,
} from "./genetics.js";
import { evolve, loadChampions, saveChampions, syncGenerationsVariations } from "./evolve.js";
import { vaultPlant, vaultList, syncVaultVariations } from "./vault.js";
import { exportSTL, exportGLB, downloadBlob } from "./exporters.js";

const GROUPS = [
  {
    label: "The book",
    ids: ["fractals", "trees2d", "trees3d", "colonization", "racemes", "phyllotaxis", "leaves", "development"],
  },
  { label: "Emergence", ids: ["ifs", "cells", "automata", "particlelife", "reaction", "dla", "lenia"] },
  { label: "Living collection", ids: ["evolution", "generations", "vault"] },
];
const HALLS = GROUPS.flatMap((g) => g.ids.map(familyById));
const INFO_NO = HALLS.length + 1;
const hallNo = (fam) => HALLS.indexOf(fam) + 1;

const GROUND = "#111111";
const FOV = 30;
const PLATE_PX = 440;

const navEl = document.getElementById("nav");
const contentEl = document.getElementById("content");

// --- dom helpers ------------------------------------------------------------

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

function heading(no, text) {
  return h("h1", null, h("span", { class: "sec" }, no), " ", text);
}

// --- rendering --------------------------------------------------------------

function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  return r;
}

function makeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GROUND);
  scene.add(new THREE.HemisphereLight(0xbfd0ff, 0x2a2620, 0.95));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xfff2df, 1.4);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
  return scene;
}

// default camera angle where the generic fit picks the wrong side
const VIEW_HINT = {
  phyllotaxis: (v) => (v.cylinder ? null : { yaw: Math.PI, pitch: 0.69 }),
};
const hintFor = (fam, v) => (VIEW_HINT[fam.id] ? VIEW_HINT[fam.id](v) : null);

function fit(obj, aspect, hint) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  obj.position.sub(box.getCenter(new THREE.Vector3()));
  const tv = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const th = tv * aspect;
  const wide = Math.max(size.x, size.y, 1e-3);
  if (size.z < 0.15 * wide) {
    const dist = Math.max(size.y / 2 / tv, size.x / 2 / th) * 1.06 + size.z;
    return { yaw: 0, pitch: 0, dist };
  }
  const r = Math.max(size.length() / 2, 0.25);
  const dist = (r / Math.sin(Math.atan(Math.min(tv, th)))) * 0.8;
  if (hint) return { ...hint, dist };
  if (size.y < 0.15 * Math.max(size.x, size.z)) return { yaw: 0, pitch: 1.0, dist };
  return { yaw: 0.6, pitch: 0.2, dist };
}

function aim(camera, view) {
  camera.position.set(
    view.dist * Math.cos(view.pitch) * Math.sin(view.yaw),
    view.dist * Math.sin(view.pitch),
    view.dist * Math.cos(view.pitch) * Math.cos(view.yaw),
  );
  camera.lookAt(0, 0, 0);
}

function dispose(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) for (const m of [].concat(n.material)) m.dispose();
  });
}

function tickGrowth(parent, t) {
  const g = parent.userData.growth;
  const phase = Math.floor((t / g.period) % (g.count + g.hold));
  const idx = Math.min(phase, g.count - 1);
  if (parent.userData._idx !== idx) {
    parent.children.forEach((c, i) => (c.visible = i === idx));
    parent.userData._idx = idx;
  }
}

// frames are museum dressing; flat works sit directly on the plate ground
const unframed = (v) => ({ ...v, framed: false });

const isLive = (obj) => !!(obj.userData.tick || obj.userData.growth);

// --- plates -----------------------------------------------------------------

let plateRenderer = null;
let plateScene = null;
let plateCamera = null;
let glError = null;

function ensurePlateRenderer() {
  if (plateRenderer || glError) return;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = PLATE_PX;
    plateRenderer = makeRenderer(c);
    plateRenderer.setSize(PLATE_PX, PLATE_PX, false);
    plateScene = makeScene();
    plateCamera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 400);
  } catch (e) {
    glError = e;
  }
}

let queue = [];
let live = [];
let clock = 0;
let onQueueProgress = null;

function drawPlate(job) {
  plateScene.add(job.obj);
  aim(plateCamera, job.view);
  plateRenderer.render(plateScene, plateCamera);
  plateScene.remove(job.obj);
  job.ctx.drawImage(plateRenderer.domElement, 0, 0, PLATE_PX, PLATE_PX);
}

function runJob(job) {
  try {
    job.obj = job.fam.make(unframed(job.v));
    job.view = fit(job.obj, 1, hintFor(job.fam, job.v));
    if (job.obj.userData.growth) tickGrowth(job.obj, clock);
    drawPlate(job);
  } catch (e) {
    console.error(e);
    job.noteEl.textContent = "Build failed: " + e.message;
    job.obj = null;
    return;
  }
  if (isLive(job.obj)) live.push(job);
  else {
    dispose(job.obj);
    job.obj = null;
  }
}

function clearPlates() {
  queue = [];
  for (const job of live) dispose(job.obj);
  live = [];
  onQueueProgress = null;
}

function plate(fam, vi, extra) {
  const v = fam.variations[vi];
  const canvas = h("canvas", { width: PLATE_PX, height: PLATE_PX });
  const noteEl = h("span", { class: "plate-note" }, v.note || "");
  const link = h(
    "a",
    { class: "plate-link", href: `#${fam.id}/${vi}` },
    canvas,
    h("span", { class: "plate-name" }, v.name),
    noteEl,
  );
  queue.push({ fam, v, canvas, ctx: canvas.getContext("2d"), noteEl, obj: null, view: null });
  return h("div", { class: "plate" }, link, extra);
}

function plateGrid(fam, indices, extraFor) {
  const total = indices.length;
  const status = h("p", { class: "count" });
  const grid = h("div", { class: "plates" }, indices.map((vi) => plate(fam, vi, extraFor && extraFor(vi))));
  if (glError) {
    status.textContent = "WebGL unavailable: " + glError.message;
    queue = [];
    return [status, grid];
  }
  const report = () => {
    const done = total - queue.length;
    status.textContent =
      done < total ? `Rendering ${done + 1} of ${total}` : `${total} exhibit${total === 1 ? "" : "s"}`;
  };
  onQueueProgress = report;
  report();
  return [status, grid];
}

// --- hall pages -------------------------------------------------------------

function hallHead(fam) {
  return [heading(hallNo(fam), fam.title), h("p", { class: "sub" }, fam.subtitle), h("p", null, fam.blurb)];
}

function hallPage(fam) {
  if (fam.id === "evolution") return greenhousePage(fam);
  if (fam.id === "generations") return generationsPage(fam);
  if (fam.id === "vault") return vaultPage(fam);
  return [...hallHead(fam), ...plateGrid(fam, fam.variations.map((_, i) => i))];
}

function greenhousePage(fam) {
  syncVariations(fam);
  const act = (fn) => () => {
    fn();
    render();
  };
  const bar = h(
    "div",
    { class: "actions" },
    h("button", { onclick: act(rerollBrood) }, "Breed new brood"),
    h("button", { onclick: act(reseedLineage) }, "Wild seed"),
    h(
      "button",
      { onclick: act(() => vaultPlant(getParentGenome(), "Greenhouse · Gen " + getGeneration())) },
      "Preserve parent",
    ),
  );
  const state = h(
    "p",
    null,
    `Generation ${getGeneration()}. Seed vault: ${vaultList().length} preserved. `,
    "Select an offspring to make it the next parent.",
  );
  const select = (vi) =>
    vi === 0 ? null : h("button", { onclick: act(() => selectOffspring(vi - 1)) }, "Select as parent");
  return [...hallHead(fam), state, bar, ...plateGrid(fam, fam.variations.map((_, i) => i), select)];
}

let run = null; // { iter, statusEl }

function generationsPage(fam) {
  const champions = loadChampions();
  syncGenerationsVariations(fam);
  const statusEl = h("p", null, champions.length ? "Last run preserved." : "0 champions. No run yet.");
  const sow = h(
    "button",
    {
      onclick: () => {
        run = { iter: evolve({}), statusEl };
        sow.disabled = true;
        statusEl.textContent = "Evolving: sowing 16 wild seeds";
      },
    },
    "Sow 16 wild seeds",
  );
  const body = champions.length ? plateGrid(fam, champions.map((_, i) => i)) : [];
  return [...hallHead(fam), statusEl, h("div", { class: "actions" }, sow), ...body];
}

function stepRun() {
  for (let k = 0; k < 3 && run; k++) {
    const { value, done } = run.iter.next();
    if (done || !value) {
      run = null;
    } else if (value.type === "progress") {
      run.statusEl.textContent = `Evolving: generation ${value.gen} of 16, seed ${value.i} of ${value.total}`;
    } else if (value.type === "done") {
      saveChampions(value.champions);
      run = null;
      render();
    }
  }
}

function vaultPage(fam) {
  syncVaultVariations(fam);
  const n = fam.variations.length;
  const body = n
    ? plateGrid(fam, fam.variations.map((_, i) => i))
    : [h("p", null, "0 seeds preserved. Preserve a parent from the Evolution Greenhouse.")];
  return [...hallHead(fam), ...body];
}

function infoPage() {
  const rows = HALLS.map((fam) =>
    h(
      "tr",
      null,
      h("td", { class: "num" }, hallNo(fam)),
      h("td", null, h("a", { href: "#" + fam.id }, fam.title)),
      h("td", null, fam.subtitle),
      h("td", { class: "num" }, fam.kind ? "dynamic" : fam.variations.length),
    ),
  );
  const fixed = HALLS.filter((f) => !f.kind).reduce((n, f) => n + f.variations.length, 0);
  return [
    heading(INFO_NO, "Info"),
    h(
      "p",
      null,
      "Specimens from ",
      h("a", { href: "https://algorithmicbotany.org/papers/abop/abop.pdf" }, "The Algorithmic Beauty of Plants"),
      " and adjacent emergent algorithms. ",
      `${HALLS.length} halls, ${fixed} fixed exhibits.`,
    ),
    h(
      "table",
      null,
      h("thead", null, h("tr", null, ["No", "Hall", "Source", "Exhibits"].map((t) => h("th", null, t)))),
      h("tbody", null, rows),
    ),
    h(
      "ul",
      null,
      h("li", null, h("a", { href: "chapters.html" }, "Classic 2D chapter pages")),
      h("li", null, h("a", { href: "museum.html" }, "Walkable 3D museum"), " (parked, unmaintained)"),
      h("li", null, h("a", { href: "https://github.com/kh3dron/plants" }, "Source")),
    ),
    h(
      "p",
      null,
      "NOTE: greenhouse lineage, generation champions, and the seed vault are stored in this browser's localStorage.",
    ),
  ];
}

// --- detail page ------------------------------------------------------------

let bench = null;
let benchRenderer = null;
let benchScene = null;
let benchCamera = null;

const getByPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
function setByPath(o, p, val) {
  const ks = p.split(".");
  let t = o;
  for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]];
  t[ks[ks.length - 1]] = val;
}
const controlsFor = (fam, v) => (typeof fam.controls === "function" ? fam.controls(v) : fam.controls || []);
const fmt = (x, isInt) => (x == null ? "—" : isInt ? String(Math.round(x)) : (+x).toFixed(x < 1 ? 3 : 1));

function defaults(fam, base) {
  const vals = {};
  for (const c of controlsFor(fam, base)) {
    const v = getByPath(base, c.path);
    if (v != null) vals[c.path] = v;
  }
  return vals;
}

function compose(b) {
  const v = cloneVariant(b.base);
  for (const [path, val] of Object.entries(b.vals)) {
    try {
      setByPath(v, path, val);
    } catch {
      /* path absent on this variant */
    }
  }
  if (b.grammar) {
    v.axiom = b.axiom;
    v.rules = { ...b.rules };
  }
  return v;
}

function benchRebuild(refit) {
  const b = bench;
  let built;
  try {
    built = b.fam.make(unframed(compose(b)));
  } catch (e) {
    b.say("Build failed: " + e.message);
    return;
  }
  if (b.obj) {
    benchScene.remove(b.obj);
    dispose(b.obj);
  }
  b.obj = built;
  const view = fit(built, benchCamera.aspect, hintFor(b.fam, b.base));
  if (refit) Object.assign(b.view, view);
  benchScene.add(built);
  b.needs = true;
}

function benchResize() {
  if (!bench) return;
  const c = bench.canvas;
  const w = c.clientWidth;
  const hgt = c.clientHeight;
  if (!w || !hgt) return;
  benchRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  benchRenderer.setSize(w, hgt, false);
  benchCamera.aspect = w / hgt;
  benchCamera.updateProjectionMatrix();
  bench.needs = true;
}
window.addEventListener("resize", benchResize);

function benchState(b) {
  const state = { id: b.fam.id, vi: b.vi, vals: b.vals };
  if (b.grammar) {
    const baseRules = {};
    for (const k of Object.keys(b.base.rules || {})) if (b.base.rules[k] !== k) baseRules[k] = b.base.rules[k];
    if (b.axiom !== b.base.axiom || JSON.stringify(b.rules) !== JSON.stringify(baseRules)) {
      state.ax = b.axiom;
      state.ru = { ...b.rules };
    }
  }
  return state;
}

function detailPage(fam, vi, restore) {
  if (fam.id === "evolution") syncVariations(fam);
  if (fam.id === "generations") syncGenerationsVariations(fam);
  if (fam.id === "vault") syncVaultVariations(fam);
  const base = fam.variations[vi];
  if (!base) return [heading(hallNo(fam), fam.title), h("p", null, `Exhibit not found: ${fam.id}/${vi}`)];

  const canvas = h("canvas", { class: "bench-canvas" });
  const statusEl = h("p", { class: "status" }, "Drag rotates. Scroll zooms.");
  const paramsEl = h("div");
  const grammarEl = h("div");
  const grammar = !!fam.grammar && !Array.isArray(base.rules);

  const b = {
    fam,
    vi,
    base,
    canvas,
    vals: defaults(fam, base),
    grammar,
    axiom: base.axiom || "",
    rules: grammar ? { ...base.rules } : {},
    rows: [],
    obj: null,
    view: { yaw: 0, pitch: 0, dist: 6 },
    dirty: false,
    needs: true,
    say: (msg) => (statusEl.textContent = msg),
  };
  if (restore) {
    if (restore.vals) Object.assign(b.vals, restore.vals);
    if (grammar && restore.ax != null) b.axiom = restore.ax;
    if (grammar && restore.ru) b.rules = { ...restore.ru };
  }

  const readRows = () => {
    b.rules = {};
    for (const r of b.rows) {
      const sym = r.sym.value.trim();
      if (sym) b.rules[sym] = r.rep.value;
    }
    b.dirty = true;
  };

  const buildPanel = () => {
    paramsEl.replaceChildren();
    const ctrls = controlsFor(fam, base);
    if (ctrls.length) paramsEl.append(h("h2", null, "Parameters"));
    for (const c of ctrls) {
      const isInt = c.step >= 1;
      const valEl = h("span", { class: "val" }, fmt(b.vals[c.path], isInt));
      const input = h("input", { type: "range", min: c.min, max: c.max, step: c.step });
      if (b.vals[c.path] != null) input.value = b.vals[c.path];
      input.addEventListener("input", () => {
        b.vals[c.path] = parseFloat(input.value);
        valEl.textContent = fmt(b.vals[c.path], isInt);
        b.dirty = true;
      });
      paramsEl.append(h("label", { class: "ctrl" }, h("span", { class: "ctrl-head" }, c.label, valEl), input));
    }

    grammarEl.replaceChildren();
    b.rows = [];
    if (!grammar) return;
    const axiom = h("input", { type: "text", spellcheck: "false" });
    axiom.value = b.axiom;
    axiom.addEventListener("input", () => {
      b.axiom = axiom.value;
      b.dirty = true;
    });
    const rulesEl = h("div");
    const addRow = (sym, rep) => {
      const rec = {
        sym: h("input", { type: "text", class: "sym", maxlength: 2, spellcheck: "false", "aria-label": "Symbol" }),
        rep: h("input", { type: "text", spellcheck: "false", "aria-label": "Replacement" }),
      };
      rec.sym.value = sym;
      rec.rep.value = rep;
      rec.sym.addEventListener("input", readRows);
      rec.rep.addEventListener("input", readRows);
      const row = h(
        "div",
        { class: "rule" },
        rec.sym,
        "→",
        rec.rep,
        h(
          "button",
          {
            onclick: () => {
              row.remove();
              b.rows = b.rows.filter((r) => r !== rec);
              readRows();
            },
          },
          "Del",
        ),
      );
      rulesEl.append(row);
      b.rows.push(rec);
    };
    for (const [sym, rep] of Object.entries(b.rules)) if (rep !== sym) addRow(sym, rep);
    grammarEl.append(
      h("h2", null, "Grammar"),
      h("label", { class: "ctrl" }, h("span", { class: "ctrl-head" }, "Axiom"), axiom),
      h("div", { class: "ctrl-head" }, "Rules"),
      rulesEl,
      h("button", { onclick: () => addRow("", "") }, "Add rule"),
    );
    readRows();
  };

  const reset = () => {
    b.vals = defaults(fam, base);
    b.axiom = base.axiom || "";
    b.rules = grammar ? { ...base.rules } : {};
    buildPanel();
    b.dirty = true;
    b.say("Reset to catalog values.");
  };
  const randomize = () => {
    for (const c of controlsFor(fam, base)) {
      const steps = Math.max(1, Math.floor((c.max - c.min) / c.step));
      b.vals[c.path] = +(c.min + Math.floor(Math.random() * (steps + 1)) * c.step).toFixed(6);
    }
    buildPanel();
    b.dirty = true;
    b.say("Parameters randomized.");
  };
  const copyLink = async () => {
    history.replaceState(null, "", "#exhibit=" + encodeURIComponent(JSON.stringify(benchState(b))));
    try {
      await navigator.clipboard.writeText(location.href);
      b.say("Link copied.");
    } catch (e) {
      b.say("Copy failed: " + e.message + ". The link is in the address bar.");
    }
  };
  const png = () => {
    benchRenderer.render(benchScene, benchCamera);
    const a = h("a", { download: `${fam.id}-specimen.png`, href: canvas.toDataURL("image/png") });
    a.click();
    b.say("PNG downloaded.");
  };
  const glb = async () => {
    if (!b.obj) return;
    try {
      downloadBlob(await exportGLB(b.obj), `${fam.id}-specimen.glb`, "model/gltf-binary");
      b.say("GLB downloaded.");
    } catch (e) {
      console.error(e);
      b.say("GLB export failed: " + e.message);
    }
  };
  const stl = () => {
    if (!b.obj) return;
    const buf = exportSTL(b.obj);
    if (!buf) return b.say("STL export refused: no surface (point cloud).");
    downloadBlob(buf, `${fam.id}-specimen.stl`, "model/stl");
    b.say("STL downloaded.");
  };

  // orbit
  let dragging = false;
  let lx = 0;
  let ly = 0;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    lx = e.clientX;
    ly = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    b.view.yaw -= (e.clientX - lx) * 0.01;
    b.view.pitch = Math.max(-1.4, Math.min(1.4, b.view.pitch + (e.clientY - ly) * 0.01));
    lx = e.clientX;
    ly = e.clientY;
    b.needs = true;
  });
  const stop = () => (dragging = false);
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      b.view.dist = Math.max(0.5, Math.min(80, b.view.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
      b.needs = true;
    },
    { passive: false },
  );

  try {
    benchRenderer = makeRenderer(canvas);
  } catch (e) {
    return [heading(hallNo(fam), fam.title), h("p", null, "WebGL unavailable: " + e.message)];
  }
  benchScene = makeScene();
  benchCamera = new THREE.PerspectiveCamera(FOV, 4 / 3, 0.05, 400);
  bench = b;
  buildPanel();
  b.dirty = false;
  requestAnimationFrame(() => {
    if (bench !== b) return;
    benchResize();
    benchRebuild(true);
  });

  const n = fam.variations.length;
  const pager = h(
    "p",
    { class: "pager" },
    vi > 0 ? h("a", { href: `#${fam.id}/${vi - 1}` }, "Previous") : "Previous",
    ` · Exhibit ${vi + 1} of ${n} · `,
    vi < n - 1 ? h("a", { href: `#${fam.id}/${vi + 1}` }, "Next") : "Next",
  );

  return [
    h("p", { class: "crumb" }, h("a", { href: "#" + fam.id }, `${hallNo(fam)} ${fam.title}`)),
    heading(`${hallNo(fam)}.${vi + 1}`, base.name),
    h("p", { class: "sub" }, base.note || ""),
    h(
      "div",
      { class: "bench" },
      h("div", { class: "bench-view" }, canvas, statusEl, pager),
      h(
        "div",
        { class: "bench-panel" },
        paramsEl,
        grammarEl,
        h(
          "div",
          { class: "actions" },
          controlsFor(fam, base).length ? h("button", { onclick: randomize }, "Randomize") : null,
          h("button", { onclick: reset }, "Reset"),
          h("button", { onclick: copyLink }, "Copy link"),
          h("button", { onclick: png }, "PNG"),
          h("button", { onclick: glb }, "GLB"),
          h("button", { onclick: stl }, "STL"),
        ),
      ),
    ),
  ];
}

function closeBench() {
  if (!bench) return;
  if (bench.obj) dispose(bench.obj);
  benchRenderer.dispose();
  benchRenderer.forceContextLoss();
  bench = null;
  benchRenderer = benchScene = benchCamera = null;
}

// --- routing ----------------------------------------------------------------

function parseRoute() {
  const raw = location.hash.slice(1);
  if (!raw) return { fam: HALLS[0] };
  if (raw === "info") return { info: true };
  if (raw.startsWith("exhibit=")) {
    try {
      const s = JSON.parse(decodeURIComponent(raw.slice(8)));
      const fam = HALLS.find((f) => f.id === s.id);
      if (fam) return { fam, vi: Number.isInteger(s.vi) ? s.vi : fam.heroIndex || 0, restore: s };
    } catch {
      /* falls through to not found */
    }
    return { missing: raw };
  }
  const [id, vi] = raw.split("/");
  const fam = HALLS.find((f) => f.id === id);
  if (!fam) return { missing: raw };
  if (vi === undefined) return { fam };
  return /^\d+$/.test(vi) ? { fam, vi: Number(vi) } : { missing: raw };
}

function buildNav() {
  let n = 0;
  for (const g of GROUPS) {
    navEl.append(h("div", { class: "nav-group" }, g.label));
    for (const id of g.ids) {
      const fam = familyById(id);
      navEl.append(h("a", { href: "#" + id, "data-id": id }, `${++n} ${fam.title}`));
    }
  }
  navEl.append(h("div", { class: "nav-group" }, "Reference"));
  navEl.append(h("a", { href: "#info", "data-id": "info" }, `${INFO_NO} Info`));
}

function render() {
  clearPlates();
  closeBench();
  run = null;
  ensurePlateRenderer();
  const route = parseRoute();
  let nodes;
  let active = null;
  if (route.info) {
    nodes = infoPage();
    active = "info";
  } else if (route.missing) {
    nodes = [h("h1", null, "Not found"), h("p", null, `No page at #${route.missing}`)];
  } else {
    active = route.fam.id;
    nodes = route.vi === undefined ? hallPage(route.fam) : detailPage(route.fam, route.vi, route.restore);
  }
  contentEl.replaceChildren(...nodes);
  for (const a of navEl.querySelectorAll("a")) {
    if (a.dataset.id === active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  window.scrollTo(0, 0);
}

// --- loop -------------------------------------------------------------------

let last = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
  last = t;
  clock += dt;

  if (run) stepRun();

  if (plateRenderer) {
    if (queue.length) {
      runJob(queue.shift());
      if (onQueueProgress) onQueueProgress();
    }
    for (const job of live) {
      if (job.obj.userData.tick) job.obj.userData.tick(dt, { renderer: plateRenderer });
      if (job.obj.userData.growth) tickGrowth(job.obj, clock);
      drawPlate(job);
    }
  }

  if (bench) {
    if (bench.dirty) {
      bench.dirty = false;
      benchRebuild(false);
    }
    const obj = bench.obj;
    if (obj && obj.userData.tick) obj.userData.tick(dt, { renderer: benchRenderer });
    if (obj && obj.userData.growth) tickGrowth(obj, clock);
    if (obj && (bench.needs || isLive(obj))) {
      bench.needs = false;
      aim(benchCamera, bench.view);
      benchRenderer.render(benchScene, benchCamera);
    }
  }
}

buildNav();
window.addEventListener("hashchange", render);
render();
requestAnimationFrame(loop);

window.__gallery = { queue: () => queue.length, live: () => live.length, bench: () => bench };
