// Particle life (Ventrella-style clusters): k species, one asymmetric
// attraction matrix, a triangular force kernel. Cell-like blobs, chasers and
// orbits emerge from rules that mention none of them. The sim runs live via
// the userData.tick hook.
import * as THREE from "three";
import { makeRng } from "./lsystem.js";

const HUES = ["#ff5f7a", "#ffcf3f", "#4fe38a", "#4fb7ff", "#c07fe8", "#ff9d5f", "#7fffd4", "#f2f3ee"];

export function buildParticleLife(v) {
  const rng = makeRng(v.seed || 1);
  const S = Math.max(2, Math.min(v.species || 5, 8));
  const N = Math.max(50, Math.min(v.count || 450, 900));
  const W = 2.0; // half-width of the 2D world, local units
  const rMax = v.rMax || 0.35;
  const rMin = 0.05;
  const force = v.force || 1.2;
  const friction = v.friction || 2.6;

  const M = [];
  for (let i = 0; i < S; i++) {
    M.push([]);
    for (let j = 0; j < S; j++) M[i].push(rng() * 2 - 1);
  }
  if (v.symmetric) {
    for (let i = 0; i < S; i++) for (let j = 0; j < i; j++) M[i][j] = M[j][i];
  }

  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 2);
  const spec = new Uint8Array(N);
  const colors = new Float32Array(N * 3);
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rng() * 2 - 1) * W * 0.9;
    pos[i * 3 + 1] = (rng() * 2 - 1) * W * 0.9;
    pos[i * 3 + 2] = (rng() * 2 - 1) * 0.08; // static depth jitter
    spec[i] = Math.floor(rng() * S);
    col.set(HUES[spec[i]]);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", posAttr);
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: v.pointSize || 0.05,
      vertexColors: true,
      toneMapped: false,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  pts.frustumCulled = false;

  const group = new THREE.Group();
  // vitrine: dark backing, faint glass, edge frame
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 2.3, W * 2.3),
    new THREE.MeshStandardMaterial({ color: "#05070c", roughness: 1 }),
  );
  back.position.z = -0.24;
  group.add(back);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(W * 2.3, W * 2.3, 0.5),
    new THREE.MeshStandardMaterial({
      color: "#8fb7d0",
      transparent: true,
      opacity: 0.06,
      roughness: 0.1,
      metalness: 0,
      depthWrite: false,
    }),
  );
  group.add(glass);
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W * 2.3, W * 2.3, 0.5)),
    new THREE.LineBasicMaterial({ color: v.frameColor || "#ff8fb0", transparent: true, opacity: 0.5 }),
  );
  group.add(frame);
  group.add(pts);

  const rMax2 = rMax * rMax;
  const span = rMax - rMin;
  function tick(rawDt) {
    const dt = Math.min(rawDt, 0.033);
    for (let i = 0; i < N; i++) {
      const xi = pos[i * 3];
      const yi = pos[i * 3 + 1];
      const mi = M[spec[i]];
      let fx = 0;
      let fy = 0;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const dx = pos[j * 3] - xi;
        const dy = pos[j * 3 + 1] - yi;
        const d2 = dx * dx + dy * dy;
        if (d2 > rMax2 || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        let f;
        if (d < rMin) {
          f = (d / rMin - 1) * 3; // hard core repulsion
        } else {
          f = mi[spec[j]] * (1 - Math.abs(2 * d - rMin - rMax) / span);
        }
        fx += (dx / d) * f;
        fy += (dy / d) * f;
      }
      // soft vitrine walls
      if (xi < -W) fx += (-W - xi) * 8;
      if (xi > W) fx -= (xi - W) * 8;
      if (yi < -W) fy += (-W - yi) * 8;
      if (yi > W) fy -= (yi - W) * 8;
      vel[i * 2] += fx * force * dt;
      vel[i * 2 + 1] += fy * force * dt;
    }
    const damp = Math.max(0, 1 - friction * dt);
    for (let i = 0; i < N; i++) {
      vel[i * 2] *= damp;
      vel[i * 2 + 1] *= damp;
      pos[i * 3] += vel[i * 2] * dt;
      pos[i * 3 + 1] += vel[i * 2 + 1] * dt;
    }
    posAttr.needsUpdate = true;
  }

  const out = normalizeLocal(group, v.height || 2.3);
  out.userData.tick = tick;
  return out;
}

// same normalization contract as specimens.js: base at y=0, centered in x/z
function normalizeLocal(obj, targetHeight) {
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
