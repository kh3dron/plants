// Diffusion-limited aggregation (Witten & Sander 1981): particles random-walk
// until they touch the cluster and freeze. Branches shadow their neighbors,
// so the same physics grows coral, frost and electrodeposits. Lattice walkers
// with spawn/kill shells; deposition order drives the color gradient.
import { makeRng } from "./lsystem.js";

// 3D walker on an N³ lattice. Seeds a small disk at the floor; particles rain
// in from above with a downward bias and stick when they touch the cluster.
export function dla3(v) {
  const N = v.grid || 64;
  const rng = makeRng(v.seed || 1);
  const occ = new Uint8Array(N * N * N);
  const idx = (x, y, z) => (y * N + z) * N + x;
  const cells = []; // [x,y,z, ...] in deposition order
  const c = N >> 1;
  const seedR = v.seedRadius != null ? v.seedRadius : 2;
  for (let x = -seedR; x <= seedR; x++) {
    for (let z = -seedR; z <= seedR; z++) {
      if (x * x + z * z <= seedR * seedR) {
        occ[idx(c + x, 0, c + z)] = 1;
        cells.push(c + x, 0, c + z);
      }
    }
  }

  const stick = v.stickiness != null ? v.stickiness : 1;
  const bias = v.bias != null ? v.bias : 0.18; // extra weight on falling
  const slab = v.slab || 0; // >0: confine z within ±slab of center (sea fan)
  let maxY = 0;
  const P = Math.min(v.particles || 2400, 6000);

  const touches = (x, y, z) =>
    (x > 0 && occ[idx(x - 1, y, z)]) ||
    (x < N - 1 && occ[idx(x + 1, y, z)]) ||
    (y > 0 && occ[idx(x, y - 1, z)]) ||
    (y < N - 1 && occ[idx(x, y + 1, z)]) ||
    (z > 0 && occ[idx(x, y, z - 1)]) ||
    (z < N - 1 && occ[idx(x, y, z + 1)]);

  for (let p = 0; p < P; p++) {
    const top = Math.min(maxY + 6, N - 2);
    let x = 1 + Math.floor(rng() * (N - 2));
    let z = slab
      ? c - slab + Math.floor(rng() * (2 * slab + 1))
      : 1 + Math.floor(rng() * (N - 2));
    let y = top;
    let guard = 0;
    while (guard++ < 40000) {
      if (occ[idx(x, y, z)] === 0 && touches(x, y, z) && rng() < stick) {
        occ[idx(x, y, z)] = 1;
        cells.push(x, y, z);
        if (y > maxY) maxY = y;
        break;
      }
      // falling is boosted by bias, rising pays for it; x/z stay symmetric
      const r = rng();
      if (r < 1 / 6 + bias) y--;
      else if (r < 2 / 6 + bias) x--;
      else if (r < 3 / 6 + bias) x++;
      else if (r < 4 / 6 + bias) z--;
      else if (r < 5 / 6 + bias) z++;
      else y++;
      // out of bounds or drifted too high: respawn
      if (
        x < 1 || x > N - 2 || z < 1 || z > N - 2 || y < 0 ||
        y > Math.min(maxY + 12, N - 2) ||
        (slab && Math.abs(z - c) > slab + 1)
      ) {
        x = 1 + Math.floor(rng() * (N - 2));
        z = slab ? c - slab + Math.floor(rng() * (2 * slab + 1)) : 1 + Math.floor(rng() * (N - 2));
        y = Math.min(maxY + 6, N - 2);
      }
    }
    if (maxY >= N - 3) break; // reached the ceiling
  }
  return { cells, dims: 3 };
}

// 2D walker. seed: "center" (dendrite) or "bottom" (frost creeping up a pane).
export function dla2(v) {
  const N = v.grid || 140;
  const rng = makeRng(v.seed || 1);
  const occ = new Uint8Array(N * N);
  const cells = [];
  const c = N >> 1;
  const fromEdge = v.seedMode === "bottom";
  if (fromEdge) {
    for (let x = 0; x < N; x++) {
      occ[x] = 1;
      cells.push(x, 0);
    }
  } else {
    occ[c * N + c] = 1;
    cells.push(c, c);
  }

  const stick = v.stickiness != null ? v.stickiness : 1;
  let maxR = fromEdge ? 0 : 1; // frost: max height; dendrite: max radius
  const P = Math.min(v.particles || 3200, 9000);

  const touches = (x, y) =>
    (x > 0 && occ[y * N + x - 1]) ||
    (x < N - 1 && occ[y * N + x + 1]) ||
    (y > 0 && occ[(y - 1) * N + x]) ||
    (y < N - 1 && occ[(y + 1) * N + x]);

  for (let p = 0; p < P; p++) {
    let x;
    let y;
    if (fromEdge) {
      x = Math.floor(rng() * N);
      y = Math.min(maxR + 6, N - 2);
    } else {
      const a = rng() * Math.PI * 2;
      const r = Math.min(maxR + 5, c - 2);
      x = c + Math.round(Math.cos(a) * r);
      y = c + Math.round(Math.sin(a) * r);
    }
    let guard = 0;
    while (guard++ < 50000) {
      if (occ[y * N + x] === 0 && touches(x, y) && rng() < stick) {
        occ[y * N + x] = 1;
        cells.push(x, y);
        const d = fromEdge ? y : Math.max(Math.abs(x - c), Math.abs(y - c));
        if (d > maxR) maxR = d;
        break;
      }
      const r4 = rng();
      if (r4 < 0.25) x--;
      else if (r4 < 0.5) x++;
      else if (r4 < 0.75) y--;
      else y++;
      const far = fromEdge
        ? y > Math.min(maxR + 12, N - 2) || y < 0
        : Math.max(Math.abs(x - c), Math.abs(y - c)) > Math.min(maxR + 14, c - 1);
      if (x < 0 || x > N - 1 || far) {
        if (fromEdge) {
          x = Math.floor(rng() * N);
          y = Math.min(maxR + 6, N - 2);
        } else {
          const a = rng() * Math.PI * 2;
          const r = Math.min(maxR + 5, c - 2);
          x = c + Math.round(Math.cos(a) * r);
          y = c + Math.round(Math.sin(a) * r);
        }
      }
    }
    if (maxR >= (fromEdge ? N - 3 : c - 2)) break;
  }
  return { cells, dims: 2 };
}
