// Space colonization (Runions et al. 2007): scatter attraction points in a
// crown volume, grow a skeleton toward them, kill points as branches reach
// them. No grammar anywhere — branching structure emerges from competition
// for space. Radii come afterward from the pipe model.
import * as THREE from "three";
import { makeRng } from "./lsystem.js";

function sampleCrown(v, rng) {
  const kind = v.crown || "sphere";
  if (kind === "leaf") {
    // teardrop blade in the XY plane, petiole at the origin
    const L = v.length || 2.4;
    const maxW = v.width2d || 0.85;
    for (;;) {
      const t = rng();
      const w = Math.pow(Math.sin(Math.PI * Math.min(t * 1.08, 1)), 0.75) * maxW;
      const x = (rng() * 2 - 1) * maxW;
      if (Math.abs(x) <= w) return new THREE.Vector3(x, 0.15 + t * L, 0);
    }
  }
  // ellipsoidal cloud (sphere when rx == ry)
  const rx = v.rx || 1.05;
  const ry = v.ry || rx;
  const cx = v.cx || 0;
  const cy = v.cy != null ? v.cy : 1.6;
  for (;;) {
    const x = rng() * 2 - 1;
    const y = rng() * 2 - 1;
    const z = rng() * 2 - 1;
    if (x * x + y * y + z * z <= 1) {
      return new THREE.Vector3(cx + x * rx, cy + y * ry, z * rx);
    }
  }
}

export function colonize(v) {
  const rng = makeRng(v.seed || 1);
  const A = Math.min(v.attractors || 400, 2000);
  const di = v.influence || 1.0;
  const dk = v.kill || 0.16;
  const step = v.step || 0.1;
  const flat = v.crown === "leaf";

  const attractors = [];
  for (let i = 0; i < A; i++) {
    attractors.push({ pos: sampleCrown(v, rng), alive: true, bestD: Infinity, bestN: 0 });
  }

  const nodes = [{ pos: new THREE.Vector3(0, 0, 0), parent: -1 }];
  for (const a of attractors) a.bestD = a.pos.length();

  const dir = new THREE.Vector3();
  const acc = new Map(); // node index -> summed pull direction
  let lastKill = 0;

  for (let iter = 0; iter < 500 && nodes.length < 3500; iter++) {
    acc.clear();
    let alive = 0;
    let nearest = null;
    for (const a of attractors) {
      if (!a.alive) continue;
      alive++;
      if (!nearest || a.bestD < nearest.bestD) nearest = a;
      if (a.bestD > di) continue;
      let e = acc.get(a.bestN);
      if (!e) acc.set(a.bestN, (e = new THREE.Vector3()));
      dir.subVectors(a.pos, nodes[a.bestN].pos).normalize();
      e.add(dir);
    }
    if (!alive) break;
    if (iter - lastKill > 40) break; // oscillation guard

    const first = nodes.length;
    if (acc.size === 0) {
      // nothing in range yet: bridge from the closest node toward the crown
      dir.subVectors(nearest.pos, nodes[nearest.bestN].pos).normalize();
      nodes.push({
        pos: nodes[nearest.bestN].pos.clone().addScaledVector(dir, step),
        parent: nearest.bestN,
      });
    } else {
      for (const [ni, pull] of acc) {
        if (pull.lengthSq() < 1e-6) continue; // opposing pulls cancel
        pull.normalize();
        pull.x += (rng() - 0.5) * 0.25;
        pull.y += (rng() - 0.5) * 0.25;
        if (!flat) pull.z += (rng() - 0.5) * 0.25;
        else pull.z = 0;
        pull.normalize();
        nodes.push({ pos: nodes[ni].pos.clone().addScaledVector(pull, step), parent: ni });
      }
    }
    if (nodes.length === first) break;

    for (const a of attractors) {
      if (!a.alive) continue;
      for (let j = first; j < nodes.length; j++) {
        const d = a.pos.distanceTo(nodes[j].pos);
        if (d < a.bestD) {
          a.bestD = d;
          a.bestN = j;
        }
      }
      if (a.bestD < dk) {
        a.alive = false;
        lastKill = iter;
      }
    }
  }

  // pipe-model radii: leaves are tipR, a parent is the p-norm of its children
  const p = v.pipeExp || 2.2;
  const tipR = v.tipRadius || 0.012;
  const sums = new Float64Array(nodes.length);
  const radii = new Float64Array(nodes.length);
  for (let i = nodes.length - 1; i >= 0; i--) {
    radii[i] = Math.max(sums[i] > 0 ? Math.pow(sums[i], 1 / p) : 0, tipR);
    if (nodes[i].parent >= 0) sums[nodes[i].parent] += Math.pow(radii[i], p);
  }

  const segments = [];
  for (let i = 1; i < nodes.length; i++) {
    const par = nodes[i].parent;
    segments.push({ p0: nodes[par].pos, p1: nodes[i].pos, r0: radii[par], r1: radii[i] });
  }
  return segments;
}
