// Ambient boids: a small swarm of moths drifting through each location.
// Classic Reynolds rules — separation, alignment, cohesion — plus a weak pull
// toward the nearest exhibit and soft springs at the walls. Decoration, but
// the flocking is real: the clusters and streams are emergent.
import * as THREE from "three";

const FWD = new THREE.Vector3(0, 0, 1);

function mothGeometry() {
  // a folded chevron: nose plus two swept wings with a little dihedral
  const g = new THREE.BufferGeometry();
  const verts = new Float32Array([
    0, 0, 0.05, -0.075, 0.028, -0.045, 0, 0, -0.02,
    0, 0, 0.05, 0, 0, -0.02, 0.075, 0.028, -0.045,
  ]);
  g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

export function makeSwarm(loc, opts = {}) {
  const n = opts.count || 32;
  const b = loc.bounds;
  const yMin = 1.1;
  const yMax = 4.6;
  const attractors = (loc.interactables || []).map((it) =>
    it.focus.clone().setY(it.focus.y + 0.7),
  );
  if (!attractors.length) attractors.push(new THREE.Vector3(0, 2.4, 0));

  const mesh = new THREE.InstancedMesh(
    mothGeometry(),
    new THREE.MeshBasicMaterial({
      color: opts.color || "#f2dc9c",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    }),
    n,
  );
  mesh.frustumCulled = false;

  const pos = [];
  const vel = [];
  const phase = [];
  for (let i = 0; i < n; i++) {
    pos.push(
      new THREE.Vector3(
        b.minX + Math.random() * (b.maxX - b.minX),
        yMin + Math.random() * (yMax - yMin),
        b.minZ + Math.random() * (b.maxZ - b.minZ),
      ),
    );
    const a = Math.random() * Math.PI * 2;
    vel.push(new THREE.Vector3(Math.cos(a), (Math.random() - 0.5) * 0.4, Math.sin(a)).multiplyScalar(0.9));
    phase.push(Math.random() * Math.PI * 2);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const steer = new THREE.Vector3();
  const diff = new THREE.Vector3();
  const sep = new THREE.Vector3();
  const ali = new THREE.Vector3();
  const coh = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let t = 0;

  function update(dt) {
    t += dt;
    for (let i = 0; i < n; i++) {
      const p = pos[i];
      const v = vel[i];
      steer.set(0, 0, 0);
      sep.set(0, 0, 0);
      ali.set(0, 0, 0);
      coh.set(0, 0, 0);

      let sepN = 0;
      let cohN = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        diff.subVectors(p, pos[j]);
        const d2 = diff.lengthSq();
        if (d2 < 0.49 && d2 > 1e-6) {
          sep.addScaledVector(diff, 1 / d2);
          sepN++;
        } else if (d2 < 3.24) {
          ali.add(vel[j]);
          coh.add(pos[j]);
          cohN++;
        }
      }
      if (sepN) steer.addScaledVector(sep.normalize(), 1.6);
      if (cohN) {
        ali.divideScalar(cohN).sub(v);
        steer.addScaledVector(ali, 0.5);
        coh.divideScalar(cohN).sub(p);
        steer.addScaledVector(coh, 0.35);
      }

      // orbit the nearest exhibit: pull in from afar, push off up close
      let best = attractors[0];
      let bd = Infinity;
      for (const a of attractors) {
        const d = a.distanceToSquared(p);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      diff.subVectors(best, p);
      const d = diff.length();
      if (d > 1e-4) {
        diff.divideScalar(d);
        steer.addScaledVector(diff, d > 1.4 ? 0.5 : -0.35);
      }

      // wander
      steer.x += Math.sin(t * 1.3 + phase[i] * 3.1) * 0.5;
      steer.y += Math.sin(t * 0.9 + phase[i] * 5.7) * 0.35;
      steer.z += Math.cos(t * 1.1 + phase[i] * 2.3) * 0.5;

      // soft walls
      const M = 0.8;
      if (p.x < b.minX + M) steer.x += (b.minX + M - p.x) * 3;
      if (p.x > b.maxX - M) steer.x -= (p.x - (b.maxX - M)) * 3;
      if (p.z < b.minZ + M) steer.z += (b.minZ + M - p.z) * 3;
      if (p.z > b.maxZ - M) steer.z -= (p.z - (b.maxZ - M)) * 3;
      if (p.y < yMin) steer.y += (yMin - p.y) * 3;
      if (p.y > yMax) steer.y -= (p.y - yMax) * 3;

      v.addScaledVector(steer, dt);
      // relax toward cruise speed, hard-clamped
      const sp = v.length();
      if (sp > 1e-4) {
        const target = sp + (1.1 - sp) * Math.min(1, dt * 2);
        v.multiplyScalar(Math.max(0.4, Math.min(2.4, target)) / sp);
      }
      p.addScaledVector(v, dt);

      dir.copy(v).normalize();
      q.setFromUnitVectors(FWD, dir);
      const flap = 0.35 + Math.abs(Math.sin(t * 9 + phase[i])) * 1.3;
      s.set(1, flap, 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(0.016); // scatter the instances before the first rendered frame
  return { mesh, update };
}
