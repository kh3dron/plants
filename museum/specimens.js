// The catalog. Each "family" is a room; each family holds a hero specimen for
// the main hall plus a set of permutations shown inside its room. Every build
// returns a THREE.Object3D normalized so its base sits at y=0, centered in x/z.
import * as THREE from "three";
import {
  LSystem,
  tokenizePlain,
  expandParametric,
  tokenizeParametric,
  makeRng,
} from "./lsystem.js";
import { interpret } from "./turtle.js";

// --- helpers --------------------------------------------------------------

function normalize(obj, targetHeight) {
  const g = new THREE.Group();
  g.add(obj);
  g.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = targetHeight / Math.max(size.y, 1e-3);
  obj.scale.multiplyScalar(s);
  g.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  obj.position.y -= box.min.y;
  return g;
}

const PAL = {
  trunk: new THREE.Color("#5b3f26"),
  bark: new THREE.Color("#6d4c2c"),
  leafTip: new THREE.Color("#6fbf59"),
  darkLeaf: new THREE.Color("#3f8f43"),
  neon: new THREE.Color("#2fe673"),
  neonBlue: new THREE.Color("#3a95e6"),
  gold: new THREE.Color("#ffcf3f"),
  seedDark: new THREE.Color("#5a3a1a"),
};

// --- builders -------------------------------------------------------------

function buildStringPlant(v) {
  const rng = v.seed != null ? makeRng(v.seed) : Math.random;
  const ls = new LSystem(v.axiom, v.rules, rng);
  const str = ls.generate(v.iterations);
  const group = interpret(tokenizePlain(str), v.turtle);
  return normalize(group, v.height || 2.6);
}

function buildParametricTree(v) {
  const str = expandParametric(v.axiom, v.rules, v.params, v.iterations);
  const group = interpret(tokenizeParametric(str), {
    mode: "parametric",
    ...v.turtle,
  });
  return normalize(group, v.height || 2.6);
}

function buildPhyllotaxis(v) {
  if (v.cylinder) return buildCylindricalPhyllotaxis(v);
  const count = v.count;
  const divRad = (v.divergence * Math.PI) / 180;
  const c = 0.09;
  const maxR = c * Math.sqrt(count);
  const dome = v.dome != null ? v.dome : maxR * 0.5;

  const head = new THREE.Group();

  // seeds
  const seedGeo = new THREE.SphereGeometry(1, 8, 6);
  seedGeo.scale(1, 0.5, 1);
  const seedMat = new THREE.MeshStandardMaterial({
    roughness: 0.6,
    metalness: 0.05,
  });
  const seeds = new THREE.InstancedMesh(seedGeo, seedMat, count);
  seeds.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(count * 3),
    3,
  );
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const centerC = new THREE.Color(v.centerColor || "#5a3a1a");
  const edgeC = new THREE.Color(v.edgeColor || "#ffcf3f");
  const seedR = (v.seedSize || 1) * c * 0.62;
  for (let n = 0; n < count; n++) {
    const r = c * Math.sqrt(n);
    const theta = n * divRad;
    const t = maxR > 0 ? r / maxR : 0;
    p.set(r * Math.cos(theta), dome * (1 - t * t), r * Math.sin(theta));
    q.identity();
    s.setScalar(seedR * (0.55 + 0.65 * t));
    m.compose(p, q, s);
    seeds.setMatrixAt(n, m);
    col.copy(centerC).lerp(edgeC, Math.pow(t, 0.7));
    seeds.setColorAt(n, col);
  }
  seeds.instanceMatrix.needsUpdate = true;
  if (seeds.instanceColor) seeds.instanceColor.needsUpdate = true;
  seeds.castShadow = true;
  head.add(seeds);

  // receptacle disk under the seeds
  const disk = new THREE.Mesh(
    new THREE.CylinderGeometry(maxR * 1.04, maxR * 0.9, dome * 0.6, 48),
    new THREE.MeshStandardMaterial({ color: "#4f7a34", roughness: 0.9 }),
  );
  disk.position.y = -dome * 0.32;
  disk.receiveShadow = true;
  head.add(disk);

  // petals
  if (v.petals) {
    const pc = v.petals;
    const petalGeo = new THREE.SphereGeometry(1, 8, 5);
    petalGeo.scale(0.25, 1, 0.08);
    petalGeo.translate(0, 1, 0);
    const petalMat = new THREE.MeshStandardMaterial({
      color: v.petalColor || "#ffc21e",
      roughness: 0.5,
      emissive: new THREE.Color(v.petalColor || "#ffc21e").multiplyScalar(0.12),
    });
    const petals = new THREE.InstancedMesh(petalGeo, petalMat, pc);
    const petalLen = maxR * 0.55;
    for (let i = 0; i < pc; i++) {
      const a = (i / pc) * Math.PI * 2;
      const px = Math.cos(a) * maxR * 1.02;
      const pz = Math.sin(a) * maxR * 1.02;
      p.set(px, -dome * 0.05, pz);
      // lay petal roughly flat, pointing outward
      const outward = new THREE.Vector3(Math.cos(a), 0.5, Math.sin(a)).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
      s.set(petalLen, petalLen, petalLen);
      m.compose(p, q, s);
      petals.setMatrixAt(i, m);
    }
    petals.instanceMatrix.needsUpdate = true;
    petals.castShadow = true;
    head.add(petals);
  }

  // tilt the head up toward a standing viewer
  head.rotation.x = -Math.PI * 0.28;

  const wrap = new THREE.Group();
  wrap.add(head);
  return normalize(wrap, v.height || 1.9);
}

// Cylindrical phyllotaxis (Ch 4.2): scales spiral up a cylinder → pinecone.
function buildCylindricalPhyllotaxis(v) {
  const count = v.count;
  const divRad = (v.divergence * Math.PI) / 180;
  const radius = v.radius || 0.5;
  const rise = v.rise || 0.045;
  const head = new THREE.Group();

  const scaleGeo = new THREE.SphereGeometry(1, 8, 6);
  scaleGeo.scale(1.1, 0.7, 0.5);
  const scaleMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05 });
  const scales = new THREE.InstancedMesh(scaleGeo, scaleMat, count);
  scales.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const baseC = new THREE.Color(v.centerColor || "#6b3f1e");
  const tipC = new THREE.Color(v.edgeColor || "#c69a5a");
  const H = count * rise;
  const scaleR = (v.seedSize || 1) * radius * 0.42;

  for (let n = 0; n < count; n++) {
    const theta = n * divRad;
    const y = n * rise;
    const t = n / count;
    // taper the cone slightly at top and bottom
    const rr = radius * (0.5 + 0.5 * Math.sin(Math.PI * t));
    p.set(rr * Math.cos(theta), y, rr * Math.sin(theta));
    const outward = new THREE.Vector3(Math.cos(theta), 0.35, Math.sin(theta)).normalize();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
    s.setScalar(scaleR);
    m.compose(p, q, s);
    scales.setMatrixAt(n, m);
    col.copy(baseC).lerp(tipC, t);
    scales.setColorAt(n, col);
  }
  scales.instanceMatrix.needsUpdate = true;
  if (scales.instanceColor) scales.instanceColor.needsUpdate = true;
  scales.castShadow = true;
  head.add(scales);

  // woody core
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.32, radius * 0.42, H, 16),
    new THREE.MeshStandardMaterial({ color: "#4a3218", roughness: 0.95 }),
  );
  core.position.y = H / 2;
  head.add(core);

  return normalize(head, v.height || 2.4);
}

// Iterated Function Systems (Ch 8): the "chaos game" plots an attractor as a
// point cloud. Self-illuminated so the colors read like glowing spore-dust.
function buildIFS(v) {
  const rng = makeRng(v.seed || 1);
  const maps = v.maps;
  let acc = 0;
  const cum = maps.map((mp) => (acc += mp.p) && acc);
  const N = v.points || 45000;
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);

  let x = 0;
  let y = 0;
  for (let i = 0; i < 25; i++) {
    const r = rng() * acc;
    let mi = 0;
    while (mi < cum.length - 1 && r > cum[mi]) mi++;
    const mp = maps[mi];
    const nx = mp.a * x + mp.b * y + mp.e;
    const ny = mp.c * x + mp.d * y + mp.f;
    x = nx;
    y = ny;
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < N; i++) {
    const r = rng() * acc;
    let mi = 0;
    while (mi < cum.length - 1 && r > cum[mi]) mi++;
    const mp = maps[mi];
    const nx = mp.a * x + mp.b * y + mp.e;
    const ny = mp.c * x + mp.d * y + mp.f;
    x = nx;
    y = ny;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = 0;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const baseC = new THREE.Color(v.baseColor || "#2f8f4a");
  const tipC = new THREE.Color(v.tipColor || "#9dffb8");
  const tmp = new THREE.Color();
  const h = Math.max(maxY - minY, 1e-3);
  for (let i = 0; i < N; i++) {
    const t = (positions[i * 3 + 1] - minY) / h;
    tmp.copy(baseC).lerp(tipC, t);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: v.pointSize || 0.02,
    vertexColors: true,
    sizeAttenuation: true,
    toneMapped: false,
  });
  return normalize(new THREE.Points(geo, mat), v.height || 2.7);
}

// One developmental stage (used by the growth animation).
function buildRawStage(v, n) {
  if (v.kind === "parametric") {
    const str = expandParametric(v.axiom, v.rules, v.params, n);
    return interpret(tokenizeParametric(str), { mode: "parametric", ...v.turtle });
  }
  const rng = makeRng(v.seed || 1);
  const ls = new LSystem(v.axiom, v.rules, rng);
  return interpret(tokenizePlain(ls.generate(n)), v.turtle);
}

// Animated growth (Ch 6): build every stage, stack them at a shared base, and
// leave a descriptor so the render loop can reveal them one at a time.
function buildGrowth(v) {
  const stages = [];
  for (let n = v.from; n <= v.to; n++) stages.push(buildRawStage(v, n));
  const last = stages[stages.length - 1];

  const parent = new THREE.Group();
  parent.add(last);
  parent.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(last);
  const size = box.getSize(new THREE.Vector3());
  const scale = (v.height || 2.6) / Math.max(size.y, 1e-3);
  const center = box.getCenter(new THREE.Vector3());
  parent.remove(last);

  stages.forEach((g, i) => {
    g.scale.multiplyScalar(scale);
    g.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    g.visible = i === 0;
    parent.add(g);
  });
  parent.userData.growth = { count: stages.length, period: v.period || 0.85, hold: v.hold || 3 };
  return parent;
}

// Cellular layers (Ch 7): a sheet of cells that divide. We subdivide a unit
// square generation by generation — the spirit of map L-systems — and render
// the cells as slightly-glowing tissue tiles with dark walls between them.
function buildCellularLayers(v) {
  const rng = makeRng(v.seed || 1);
  const gens = v.generations || 8;
  const minCell = v.minCell || 0.02;
  const stopProb = v.stopProb || 0;

  let cells = [{ x: 0, y: 0, w: 1, h: 1 }];
  for (let g = 0; g < gens; g++) {
    const next = [];
    for (const c of cells) {
      const small = Math.min(c.w, c.h) <= minCell;
      const apicalOk = !v.apical || rng() < c.y + c.h * 0.5 + 0.18;
      const split = !small && rng() >= stopProb && apicalOk;
      if (!split) {
        next.push(c);
        continue;
      }
      let vertical;
      if (v.orient === "aspect") vertical = c.w >= c.h;
      else if (v.orient === "random") vertical = rng() < 0.5;
      else vertical = g % 2 === 0;
      const f = 0.5 + (v.jitter || 0) * (rng() - 0.5);
      if (vertical) {
        next.push({ x: c.x, y: c.y, w: c.w * f, h: c.h });
        next.push({ x: c.x + c.w * f, y: c.y, w: c.w * (1 - f), h: c.h });
      } else {
        next.push({ x: c.x, y: c.y, w: c.w, h: c.h * f });
        next.push({ x: c.x, y: c.y + c.h * f, w: c.w, h: c.h * (1 - f) });
      }
    }
    cells = next;
  }

  const group = new THREE.Group();
  const W = 2.2;
  const Hh = 2.6;
  const depth = 0.06;
  const gap = v.gap != null ? v.gap : 0.86; // fraction of cell filled

  // dark backing so the walls read
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.02, Hh * 1.02),
    new THREE.MeshStandardMaterial({ color: "#0c140c", roughness: 1 }),
  );
  back.position.z = -depth * 0.4;
  group.add(back);

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.55,
    metalness: 0.0,
    emissiveIntensity: 0.6,
  });
  mat.emissive = new THREE.Color("#0a1e0a");
  const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cells.length * 3), 3);

  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const baseC = new THREE.Color(v.baseColor || "#274d22");
  const marginC = new THREE.Color(v.marginColor || "#8fce5f");

  cells.forEach((c, i) => {
    const cx = (c.x + c.w / 2 - 0.5) * W;
    const cy = (c.y + c.h / 2 - 0.5) * Hh;
    p.set(cx, cy, 0);
    s.set(Math.max(c.w * W * gap, 0.008), Math.max(c.h * Hh * gap, 0.008), depth);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    const t = c.y + c.h / 2;
    col.copy(baseC).lerp(marginC, Math.pow(t, 0.8) * (0.6 + 0.4 * rng()));
    mesh.setColorAt(i, col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  return normalize(group, v.height || 2.6);
}

// --- turtle presets -------------------------------------------------------

const treeTurtle = (angle, extra = {}) => ({
  material: "bark",
  radial: 6,
  step: 1,
  width: 0.08,
  taper: 0.86,
  angle,
  trunkColor: PAL.bark,
  tipColor: PAL.leafTip,
  ...extra,
});

const fractalTurtle = (angle, color) => ({
  material: "neon",
  radial: 5,
  step: 1,
  width: 0.03,
  taper: 1,
  angle,
  neonColor: color || PAL.neon,
});

const tree3dTurtle = (extra = {}) => ({
  material: "bark",
  radial: 7,
  trunkColor: PAL.trunk,
  tipColor: PAL.leafTip,
  trunkRadiusFrac: 0.026,
  ...extra,
});

const leafTurtle = (extra = {}) => ({
  material: "bark",
  radial: 5,
  step: 1,
  width: 0.04,
  taper: 0.96,
  angle: 20,
  trunkColor: new THREE.Color("#4f8f3f"),
  tipColor: new THREE.Color("#7fc35a"),
  ...extra,
});

// --- families -------------------------------------------------------------

export const FAMILIES = [
  {
    id: "fractals",
    title: "Fractal Curves",
    subtitle: "Chapter 1 · Deterministic L-systems",
    blurb:
      "Edge-rewriting curves. One production, applied over and over, fills space with self-similar detail.",
    make: buildStringPlant,
    heroIndex: 0,
    spin: false,
    variations: [
      {
        name: "Quadratic Koch Island",
        note: "n=3 · δ=90°",
        axiom: "F-F-F-F",
        rules: { F: "F+F-F-FF+F+F-F", "-": "-", "+": "+" },
        iterations: 2,
        turtle: fractalTurtle(90, PAL.neon),
        height: 2.2,
      },
      {
        name: "Koch Snowflake",
        note: "n=4 · δ=60°",
        axiom: "F--F--F",
        rules: { F: "F+F--F+F" },
        iterations: 4,
        turtle: fractalTurtle(60, PAL.neon),
        height: 2.2,
      },
      {
        name: "Hilbert Curve",
        note: "n=4 · δ=90°",
        axiom: "L",
        rules: { L: "+RF-LFL-FR+", R: "-LF+RFR+FL-" },
        iterations: 4,
        turtle: fractalTurtle(90, PAL.neonBlue),
        height: 2.2,
      },
      {
        name: "Sierpiński Arrowhead",
        note: "n=6 · δ=60°",
        axiom: "F",
        rules: { F: "G-F-G", G: "F+G+F" },
        iterations: 6,
        turtle: fractalTurtle(60, PAL.neon),
        height: 2.2,
      },
      {
        name: "Dragon Curve",
        note: "n=10 · δ=90°",
        axiom: "FX",
        rules: { X: "X+YF+", Y: "-FX-Y" },
        iterations: 10,
        turtle: fractalTurtle(90, PAL.neonBlue),
        height: 2.0,
      },
      {
        name: "Gosper Curve",
        note: "n=3 · δ=60°",
        axiom: "F",
        rules: {
          F: "F-G--G+F++FF+G-",
          G: "+F-GG--G-F++F+G",
        },
        iterations: 3,
        turtle: fractalTurtle(60, PAL.neon),
        height: 2.2,
      },
    ],
  },

  {
    id: "trees2d",
    title: "Bracketed Axial Trees",
    subtitle: "Chapter 1 · Figure 1.24",
    blurb:
      "Push/pop brackets let a single string branch. These six productions are the canonical L-system plants.",
    make: buildStringPlant,
    heroIndex: 4,
    spin: false,
    variations: [
      {
        name: "Plant (a)",
        note: "n=5 · δ=25.7°",
        axiom: "F",
        rules: { F: "F[+F]F[-F]F" },
        iterations: 4,
        turtle: treeTurtle(25.7),
      },
      {
        name: "Plant (b)",
        note: "n=5 · δ=20°",
        axiom: "F",
        rules: { F: "F[+F]F[-F][F]" },
        iterations: 4,
        turtle: treeTurtle(20),
      },
      {
        name: "Plant (c)",
        note: "n=4 · δ=22.5°",
        axiom: "F",
        rules: { F: "FF-[-F+F+F]+[+F-F-F]" },
        iterations: 4,
        turtle: treeTurtle(22.5),
      },
      {
        name: "Plant (d)",
        note: "n=6 · δ=20°",
        axiom: "X",
        rules: { X: "F[+X]F[-X]+X", F: "FF" },
        iterations: 6,
        turtle: treeTurtle(20),
      },
      {
        name: "Plant (e)",
        note: "n=6 · δ=25.7°",
        axiom: "X",
        rules: { X: "F[+X][-X]FX", F: "FF" },
        iterations: 6,
        turtle: treeTurtle(25.7),
      },
      {
        name: "Plant (f)",
        note: "n=5 · δ=22.5°",
        axiom: "X",
        rules: { X: "F-[[X]+X]+F[+FX]-X", F: "FF" },
        iterations: 5,
        turtle: treeTurtle(22.5),
      },
    ],
  },

  {
    id: "trees3d",
    title: "Three-Dimensional Trees",
    subtitle: "Chapter 2 · Parametric L-systems",
    blurb:
      "Modules carry length and width; roll and pitch operators branch into full 3D. Honda's monopodial model and kin.",
    make: buildParametricTree,
    heroIndex: 0,
    variations: [
      {
        name: "Honda Monopodial",
        note: "n=7",
        axiom: "A(1,1)",
        params: { r1: 0.9, r2: 0.6, a0: 45, a2: 45, d: 137.5, wr: 0.707 },
        rules: [
          {
            predecessor: "A(l,w)",
            successor:
              "!(w)F(l)[&(a0)B(l*r2,w*wr)]/(d)A(l*r1,w*wr)",
          },
          {
            predecessor: "B(l,w)",
            successor: "!(w)F(l)[-(a2)C(l*r2,w*wr)]C(l*r1,w*wr)",
          },
          {
            predecessor: "C(l,w)",
            successor: "!(w)F(l)[+(a2)B(l*r2,w*wr)]B(l*r1,w*wr)",
          },
        ],
        iterations: 7,
        turtle: tree3dTurtle(),
        height: 2.8,
      },
      {
        name: "Honda (wide branch)",
        note: "n=7 · a0=30°",
        axiom: "A(1,1)",
        params: { r1: 0.9, r2: 0.7, a0: 30, a2: 30, d: 137.5, wr: 0.707 },
        rules: [
          { predecessor: "A(l,w)", successor: "!(w)F(l)[&(a0)B(l*r2,w*wr)]/(d)A(l*r1,w*wr)" },
          { predecessor: "B(l,w)", successor: "!(w)F(l)[-(a2)C(l*r2,w*wr)]C(l*r1,w*wr)" },
          { predecessor: "C(l,w)", successor: "!(w)F(l)[+(a2)B(l*r2,w*wr)]B(l*r1,w*wr)" },
        ],
        iterations: 7,
        turtle: tree3dTurtle(),
        height: 2.8,
      },
      {
        name: "Aono–Kunii Sympodial",
        note: "n=9",
        axiom: "A(1,10)",
        params: { r1: 0.9, r2: 0.8, a1: 35, a2: 35, wr: 0.707 },
        rules: [
          {
            predecessor: "A(l,w)",
            successor:
              "!(w)F(l)[&(a1)B(l*r1,w*wr)]/(180)[&(a2)B(l*r2,w*wr)]",
          },
          {
            predecessor: "B(l,w)",
            successor:
              "!(w)F(l)[+(a1)B(l*r1,w*wr)][-(a2)B(l*r2,w*wr)]",
          },
        ],
        iterations: 9,
        turtle: tree3dTurtle(),
        height: 2.8,
      },
      {
        name: "Ternary Branching",
        note: "n=6",
        axiom: "!(1)F(4)/(45)A",
        params: { d1: 94.74, d2: 132.63, a: 18.95, lr: 1.109, vr: 1.732 },
        rules: [
          {
            predecessor: "A",
            successor:
              "!(vr)F(1)[&(a)F(1)A]/(d1)[&(a)F(1)A]/(d2)[&(a)F(1)A]",
          },
          { predecessor: "F(l)", successor: "F(l*lr)" },
          { predecessor: "!(w)", successor: "!(w*vr)" },
        ],
        iterations: 6,
        turtle: tree3dTurtle({ trunkRadiusFrac: 0.02 }),
        height: 2.8,
      },
      {
        name: "Honda (sparse)",
        note: "n=6 · r1=0.85",
        axiom: "A(1,1)",
        params: { r1: 0.85, r2: 0.55, a0: 55, a2: 50, d: 137.5, wr: 0.7 },
        rules: [
          { predecessor: "A(l,w)", successor: "!(w)F(l)[&(a0)B(l*r2,w*wr)]/(d)A(l*r1,w*wr)" },
          { predecessor: "B(l,w)", successor: "!(w)F(l)[-(a2)C(l*r2,w*wr)]C(l*r1,w*wr)" },
          { predecessor: "C(l,w)", successor: "!(w)F(l)[+(a2)B(l*r2,w*wr)]B(l*r1,w*wr)" },
        ],
        iterations: 6,
        turtle: tree3dTurtle(),
        height: 2.7,
      },
    ],
  },

  {
    id: "racemes",
    title: "Inflorescences",
    subtitle: "Chapter 3 · Racemes",
    blurb:
      "Flowering axes. An apex lays down internodes, phyllotactic rolls, leaves and lateral flowers as it grows.",
    make: buildStringPlant,
    heroIndex: 0,
    variations: [
      {
        name: "Simple Raceme",
        note: "n=7",
        axiom: "A",
        rules: { A: "F[&L]/(137.5)[&(55)fK]A" },
        iterations: 7,
        turtle: treeTurtle(28, {
          width: 0.045,
          taper: 0.97,
          step: 1,
          organs: {
            L: { type: "leaf", color: "#4f9d3f", size: 0.7 },
            K: { type: "flower", color: "#ffd23f", size: 0.34 },
          },
        }),
        height: 2.6,
      },
      {
        name: "Spike (sessile)",
        note: "n=8",
        axiom: "A",
        rules: { A: "F[&(70)K]/(137.5)A" },
        iterations: 8,
        turtle: treeTurtle(28, {
          width: 0.05,
          taper: 0.98,
          organs: { K: { type: "flower", color: "#e85b8a", size: 0.32 } },
        }),
        height: 2.6,
      },
      {
        name: "Leafy Raceme",
        note: "n=7",
        axiom: "A",
        rules: { A: "F[&(35)L]/(137.5)[&(60)fK]F/(137.5)A" },
        iterations: 6,
        turtle: treeTurtle(28, {
          width: 0.045,
          taper: 0.97,
          organs: {
            L: { type: "leaf", color: "#3f8f43", size: 0.85 },
            K: { type: "flower", color: "#ffcf3f", size: 0.3 },
          },
        }),
        height: 2.7,
      },
      {
        name: "Compound Raceme",
        note: "n=4",
        axiom: "A",
        rules: {
          A: "F/(137.5)[&(45)B]A",
          B: "F[&(35)fK]/(137.5)[&(35)fK]F[&(35)fK]",
        },
        iterations: 4,
        turtle: treeTurtle(26, {
          width: 0.045,
          taper: 0.95,
          organs: { K: { type: "flower", color: "#ffd23f", size: 0.26 } },
        }),
        height: 2.7,
      },
      {
        name: "Young Raceme",
        note: "n=3",
        axiom: "A",
        rules: { A: "F[&L]/(137.5)[&(55)fK]A" },
        iterations: 3,
        turtle: treeTurtle(28, {
          width: 0.05,
          taper: 0.97,
          organs: {
            L: { type: "leaf", color: "#5fb04a", size: 0.7 },
            K: { type: "flower", color: "#bfe06a", size: 0.3 },
          },
        }),
        height: 1.7,
      },
    ],
  },

  {
    id: "phyllotaxis",
    title: "Phyllotaxis",
    subtitle: "Chapter 4 · Planar & Cylindrical",
    blurb:
      "Place seed n at angle n·137.5° and radius √n. The golden angle packs florets into interlocking spirals.",
    make: buildPhyllotaxis,
    heroIndex: 0,
    variations: [
      {
        name: "Golden Angle",
        note: "137.5° · 900 seeds",
        divergence: 137.5,
        count: 900,
        seedSize: 1,
        petals: 34,
        petalColor: "#ffc21e",
        height: 2.0,
      },
      {
        name: "Just Under (137.3°)",
        note: "spirals shear",
        divergence: 137.3,
        count: 900,
        seedSize: 1,
        centerColor: "#5a3a1a",
        edgeColor: "#f4a63f",
        height: 2.0,
      },
      {
        name: "Just Over (137.7°)",
        note: "spirals shear the other way",
        divergence: 137.7,
        count: 900,
        seedSize: 1,
        height: 2.0,
      },
      {
        name: "Right Angle (90°)",
        note: "four straight arms",
        divergence: 90,
        count: 700,
        seedSize: 1.1,
        centerColor: "#3a5a1a",
        edgeColor: "#bfe06a",
        height: 2.0,
      },
      {
        name: "137.5° Dense",
        note: "1600 seeds",
        divergence: 137.5,
        count: 1600,
        seedSize: 0.8,
        petals: 55,
        petalColor: "#ffb347",
        height: 2.0,
      },
      {
        name: "Pinecone (cylindrical)",
        note: "§4.2 · scales up a cylinder",
        cylinder: true,
        divergence: 137.5,
        count: 240,
        radius: 0.55,
        rise: 0.05,
        seedSize: 1.5,
        centerColor: "#6b3f1e",
        edgeColor: "#caa06a",
        height: 2.5,
      },
    ],
  },

  {
    id: "leaves",
    title: "Compound Leaves",
    subtitle: "Chapter 5 · Models of plant organs",
    blurb:
      "A rachis lays down leaflets as it grows. Nesting the same rule makes a leaf out of little leaves.",
    make: buildStringPlant,
    heroIndex: 2,
    spin: false,
    variations: [
      {
        name: "Pinnate",
        note: "opposite leaflets",
        axiom: "A",
        rules: { A: "F[+(48)L][-(48)L]A" },
        iterations: 11,
        turtle: leafTurtle({
          organs: { L: { type: "leaf", color: "#4f9d3f", size: 1.05 } },
        }),
        height: 2.7,
      },
      {
        name: "Alternate Pinnate",
        note: "staggered leaflets",
        axiom: "A",
        rules: { A: "F[+(52)L]F[-(52)L]A" },
        iterations: 9,
        turtle: leafTurtle({
          organs: { L: { type: "leaf", color: "#57a742", size: 0.95 } },
        }),
        height: 2.7,
      },
      {
        name: "Bipinnate Fern",
        note: "leaflets of leaflets",
        axiom: "A",
        rules: {
          A: "F[+(40)B][-(40)B]A",
          B: "F[+(38)L][-(38)L]F[+(38)L][-(38)L]FL",
        },
        iterations: 6,
        turtle: leafTurtle({
          width: 0.03,
          organs: { L: { type: "leaf", color: "#3f8f43", size: 0.5 } },
        }),
        height: 2.8,
      },
      {
        name: "Palmate",
        note: "leaflets from one point",
        axiom: "[+(58)FL][+(28)FL][FL][-(28)FL][-(58)FL]",
        rules: { F: "FF" },
        iterations: 4,
        turtle: leafTurtle({
          organs: { L: { type: "leaf", color: "#4f9d3f", size: 1.4 } },
        }),
        height: 2.5,
      },
      {
        name: "Young Frond",
        note: "n=4",
        axiom: "A",
        rules: { A: "F[+(48)L][-(48)L]A" },
        iterations: 4,
        turtle: leafTurtle({
          organs: { L: { type: "leaf", color: "#7bc35a", size: 1.1 } },
        }),
        height: 1.8,
      },
    ],
  },

  {
    id: "ifs",
    title: "Fractal Ferns",
    subtitle: "Chapter 8 · Iterated Function Systems",
    blurb:
      "No turtle here — just affine maps chosen at random. The chaos game precipitates the attractor as a point cloud.",
    make: buildIFS,
    heroIndex: 0,
    spin: false,
    variations: [
      {
        name: "Barnsley Fern",
        note: "4 affine maps",
        points: 60000,
        maps: [
          { a: 0, b: 0, c: 0, d: 0.16, e: 0, f: 0, p: 0.01 },
          { a: 0.85, b: 0.04, c: -0.04, d: 0.85, e: 0, f: 1.6, p: 0.85 },
          { a: 0.2, b: -0.26, c: 0.23, d: 0.22, e: 0, f: 1.6, p: 0.07 },
          { a: -0.15, b: 0.28, c: 0.26, d: 0.24, e: 0, f: 0.44, p: 0.07 },
        ],
        pointSize: 0.018,
        height: 2.9,
      },
      {
        name: "Culcita Fern",
        note: "leaning variant",
        points: 60000,
        maps: [
          { a: 0, b: 0, c: 0, d: 0.25, e: 0, f: -0.4, p: 0.02 },
          { a: 0.95, b: 0.005, c: -0.005, d: 0.93, e: -0.002, f: 0.5, p: 0.84 },
          { a: 0.035, b: -0.2, c: 0.16, d: 0.04, e: -0.09, f: 0.02, p: 0.07 },
          { a: -0.04, b: 0.2, c: 0.16, d: 0.04, e: 0.083, f: 0.12, p: 0.07 },
        ],
        pointSize: 0.018,
        baseColor: "#2f7f4a",
        tipColor: "#b8ff9d",
        height: 2.9,
      },
      {
        name: "Fractal Tree",
        note: "2 maps",
        points: 55000,
        maps: [
          { a: 0.42, b: -0.42, c: 0.42, d: 0.42, e: 0, f: 0.2, p: 0.4 },
          { a: 0.42, b: 0.42, c: -0.42, d: 0.42, e: 0, f: 0.2, p: 0.4 },
          { a: 0.1, b: 0, c: 0, d: 0.1, e: 0, f: 0.2, p: 0.15 },
          { a: 0, b: 0, c: 0, d: 0.5, e: 0, f: 0, p: 0.05 },
        ],
        pointSize: 0.02,
        baseColor: "#6d4c2c",
        tipColor: "#8dffb0",
        height: 2.6,
      },
      {
        name: "Sierpiński Gasket",
        note: "3 maps · self-similar",
        points: 55000,
        maps: [
          { a: 0.5, b: 0, c: 0, d: 0.5, e: 0, f: 0, p: 0.34 },
          { a: 0.5, b: 0, c: 0, d: 0.5, e: 1, f: 0, p: 0.33 },
          { a: 0.5, b: 0, c: 0, d: 0.5, e: 0.5, f: 0.866, p: 0.33 },
        ],
        pointSize: 0.02,
        baseColor: "#3aa0c8",
        tipColor: "#b8f0ff",
        height: 2.4,
      },
      {
        name: "Heighway Dragon",
        note: "2 maps",
        points: 55000,
        maps: [
          { a: 0.5, b: -0.5, c: 0.5, d: 0.5, e: 0, f: 0, p: 0.5 },
          { a: -0.5, b: -0.5, c: 0.5, d: -0.5, e: 1, f: 0, p: 0.5 },
        ],
        pointSize: 0.02,
        baseColor: "#4a7fff",
        tipColor: "#c8d8ff",
        height: 2.4,
      },
      {
        name: "Lévy C Curve",
        note: "2 maps",
        points: 55000,
        maps: [
          { a: 0.5, b: -0.5, c: 0.5, d: 0.5, e: 0, f: 0, p: 0.5 },
          { a: 0.5, b: 0.5, c: -0.5, d: 0.5, e: 0.5, f: 0.5, p: 0.5 },
        ],
        pointSize: 0.02,
        baseColor: "#7dffc0",
        tipColor: "#e8fff2",
        height: 2.4,
      },
    ],
  },

  {
    id: "development",
    title: "Plant Development",
    subtitle: "Chapter 6 · Animation of growth",
    blurb:
      "Derivation as time. Each specimen replays its L-system one step at a time, then resets and grows again.",
    make: buildGrowth,
    heroIndex: 0,
    variations: [
      {
        name: "Bracketed Tree",
        note: "n : 1 → 6",
        kind: "string",
        seed: 3,
        axiom: "X",
        rules: { X: "F[+X][-X]FX", F: "FF" },
        from: 1,
        to: 6,
        turtle: treeTurtle(25.7),
        height: 2.7,
      },
      {
        name: "Honda Tree",
        note: "n : 1 → 6",
        kind: "parametric",
        axiom: "A(1,1)",
        params: { r1: 0.9, r2: 0.6, a0: 45, a2: 45, d: 137.5, wr: 0.707 },
        rules: [
          { predecessor: "A(l,w)", successor: "!(w)F(l)[&(a0)B(l*r2,w*wr)]/(d)A(l*r1,w*wr)" },
          { predecessor: "B(l,w)", successor: "!(w)F(l)[-(a2)C(l*r2,w*wr)]C(l*r1,w*wr)" },
          { predecessor: "C(l,w)", successor: "!(w)F(l)[+(a2)B(l*r2,w*wr)]B(l*r1,w*wr)" },
        ],
        from: 1,
        to: 6,
        turtle: tree3dTurtle(),
        height: 2.8,
      },
      {
        name: "Raceme",
        note: "n : 1 → 7",
        kind: "string",
        axiom: "A",
        rules: { A: "F[&L]/(137.5)[&(55)fK]A" },
        from: 1,
        to: 7,
        turtle: treeTurtle(28, {
          width: 0.045,
          taper: 0.97,
          organs: {
            L: { type: "leaf", color: "#4f9d3f", size: 0.7 },
            K: { type: "flower", color: "#ffd23f", size: 0.34 },
          },
        }),
        height: 2.6,
      },
      {
        name: "Koch Snowflake",
        note: "n : 0 → 4",
        kind: "string",
        axiom: "F--F--F",
        rules: { F: "F+F--F+F" },
        from: 0,
        to: 4,
        period: 1.0,
        turtle: fractalTurtle(60, PAL.neon),
        height: 2.2,
      },
    ],
  },

  {
    id: "cells",
    title: "Cellular Layers",
    subtitle: "Chapter 7 · Map L-systems",
    blurb:
      "Tissue as a graph of cells. Each division inserts a new wall; the rule that picks the wall decides the whole mosaic.",
    make: buildCellularLayers,
    heroIndex: 2,
    spin: false,
    variations: [
      {
        name: "Regular Epidermis",
        note: "alternating walls",
        orient: "alt",
        jitter: 0,
        generations: 8,
        baseColor: "#2c5626",
        marginColor: "#7fc457",
        height: 2.5,
      },
      {
        name: "Jittered Mosaic",
        note: "off-centre divisions",
        orient: "alt",
        jitter: 0.4,
        stopProb: 0.08,
        generations: 8,
        seed: 5,
        height: 2.5,
      },
      {
        name: "Microsorium",
        note: "squarish cells",
        orient: "aspect",
        jitter: 0.28,
        generations: 9,
        seed: 11,
        baseColor: "#24502a",
        marginColor: "#8fce5f",
        height: 2.6,
      },
      {
        name: "Apical Margin",
        note: "growth at the edge",
        orient: "aspect",
        jitter: 0.22,
        apical: true,
        generations: 10,
        seed: 2,
        baseColor: "#20461e",
        marginColor: "#a7e06a",
        height: 2.6,
      },
      {
        name: "Random Tissue",
        note: "stochastic walls",
        orient: "random",
        jitter: 0.45,
        stopProb: 0.16,
        generations: 9,
        seed: 7,
        baseColor: "#2c5030",
        marginColor: "#9ad86a",
        height: 2.5,
      },
    ],
  },
];

export function familyById(id) {
  return FAMILIES.find((f) => f.id === id);
}

// Shallow-clone a variant so focus mode can edit it without mutating the
// catalog. Keeps THREE.Color refs intact (they aren't edited).
export function cloneVariant(v) {
  const c = { ...v };
  if (v.turtle) {
    c.turtle = { ...v.turtle };
    if (v.turtle.organs) c.turtle.organs = { ...v.turtle.organs };
  }
  if (v.params) c.params = { ...v.params };
  if (Array.isArray(v.rules)) c.rules = v.rules.map((r) => ({ ...r }));
  else if (v.rules) c.rules = { ...v.rules };
  if (Array.isArray(v.maps)) c.maps = v.maps.map((m) => ({ ...m }));
  return c;
}

// --- editable-control schemas for focus mode ------------------------------

function paramCtrl(k, val) {
  if (Math.abs(val) <= 2) {
    return { path: `params.${k}`, label: k, min: 0, max: +Math.min(1, Math.max(0.2, val * 1.6)).toFixed(3), step: 0.005 };
  }
  return { path: `params.${k}`, label: k, min: 0, max: +(val * 2).toFixed(1), step: val > 20 ? 1 : 0.5 };
}

const FAMILY_CONTROLS = {
  fractals: {
    grammar: true,
    controls: [
      { path: "iterations", label: "Iterations", min: 0, max: 6, step: 1 },
      { path: "turtle.angle", label: "Angle °", min: 0, max: 180, step: 0.5 },
    ],
  },
  trees2d: {
    grammar: true,
    controls: [
      { path: "iterations", label: "Iterations", min: 1, max: 7, step: 1 },
      { path: "turtle.angle", label: "Angle °", min: 2, max: 45, step: 0.1 },
    ],
  },
  trees3d: {
    controls: (v) => [
      { path: "iterations", label: "Iterations", min: 1, max: 8, step: 1 },
      ...Object.keys(v.params || {}).map((k) => paramCtrl(k, v.params[k])),
    ],
  },
  racemes: {
    grammar: true,
    controls: [{ path: "iterations", label: "Iterations", min: 1, max: 8, step: 1 }],
  },
  leaves: {
    grammar: true,
    controls: [
      { path: "iterations", label: "Iterations", min: 1, max: 12, step: 1 },
      { path: "turtle.angle", label: "Angle °", min: 5, max: 60, step: 0.5 },
    ],
  },
  phyllotaxis: {
    controls: (v) =>
      v.cylinder
        ? [
            { path: "divergence", label: "Divergence °", min: 80, max: 180, step: 0.05 },
            { path: "count", label: "Scales", min: 50, max: 500, step: 1 },
            { path: "radius", label: "Radius", min: 0.2, max: 1.5, step: 0.01 },
            { path: "rise", label: "Rise", min: 0.02, max: 0.12, step: 0.001 },
          ]
        : [
            { path: "divergence", label: "Divergence °", min: 60, max: 180, step: 0.05 },
            { path: "count", label: "Seeds", min: 50, max: 2000, step: 10 },
            { path: "seedSize", label: "Seed size", min: 0.4, max: 2, step: 0.05 },
          ],
  },
  ifs: {
    controls: [
      { path: "points", label: "Points", min: 5000, max: 120000, step: 1000 },
      { path: "pointSize", label: "Point size", min: 0.008, max: 0.04, step: 0.001 },
    ],
  },
  cells: {
    controls: [
      { path: "generations", label: "Generations", min: 4, max: 10, step: 1 },
      { path: "jitter", label: "Wall jitter", min: 0, max: 0.5, step: 0.01 },
      { path: "stopProb", label: "Stop chance", min: 0, max: 0.4, step: 0.01 },
    ],
  },
  development: {
    controls: (v) => [
      { path: "to", label: "Max stage", min: v.from + 1, max: v.to + 2, step: 1 },
      { path: "period", label: "Seconds / step", min: 0.3, max: 2, step: 0.05 },
    ],
  },
};

for (const f of FAMILIES) {
  const c = FAMILY_CONTROLS[f.id];
  if (c) {
    f.controls = c.controls;
    f.grammar = !!c.grammar;
  }
}
