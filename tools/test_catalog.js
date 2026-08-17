// Headless catalog test: builds every variation of every family (three.js
// geometry needs no WebGL) and exercises the genetics engine.
//
//   deno run --import-map=tools/importmap.json --allow-read \
//     --allow-net=cdn.jsdelivr.net tools/test_catalog.js
import * as THREE from "three";
import { FAMILIES, familyById } from "../museum/specimens.js";
import {
  rerollBrood,
  selectOffspring,
  reseedLineage,
  getGeneration,
  syncVariations,
} from "../museum/genetics.js";
import { exportSTL } from "../museum/exporters.js";

let fails = 0;

function stats(obj) {
  let meshes = 0;
  let instances = 0;
  let points = 0;
  obj.traverse((n) => {
    if (n.isInstancedMesh) instances += n.count;
    else if (n.isPoints) points += n.geometry.getAttribute("position").count;
    else if (n.isMesh) meshes++;
  });
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  return { meshes, instances, points, h: +size.y.toFixed(2), w: +Math.max(size.x, size.z).toFixed(2) };
}

for (const fam of FAMILIES) {
  for (const v of fam.variations) {
    try {
      const s = stats(fam.make(v));
      const degenerate = s.h < 0.05 || (s.meshes === 0 && s.instances === 0 && s.points === 0);
      console.log(
        `${degenerate ? "DEGEN" : "OK   "} ${fam.id.padEnd(12)} ${v.name.padEnd(24)} meshes=${s.meshes} inst=${s.instances} pts=${s.points} h=${s.h} w=${s.w}`,
      );
      if (degenerate) fails++;
    } catch (e) {
      console.log(`FAIL  ${fam.id.padEnd(12)} ${v.name.padEnd(24)} ${e.message}`);
      fails++;
    }
  }
}

// live sims: tick every ticker specimen 120 frames, positions must stay finite
for (const fam of FAMILIES) {
  for (const v of fam.variations) {
    const obj = fam.make(v);
    if (!obj.userData.tick) continue;
    for (let f = 0; f < 120; f++) obj.userData.tick(1 / 60);
    let bad = 0;
    obj.traverse((n) => {
      const attr = n.geometry && n.geometry.getAttribute && n.geometry.getAttribute("position");
      if (!attr) return;
      for (let i = 0; i < attr.array.length; i++) if (!Number.isFinite(attr.array[i])) bad++;
    });
    console.log(`${bad ? "FAIL " : "OK   "} ticker ${fam.id}/${v.name} 120 frames, ${bad} non-finite`);
    if (bad) fails++;
  }
}

// STL export: a tree must yield a consistent binary STL
{
  const fam = familyById("trees3d");
  const buf = exportSTL(fam.make(fam.variations[0]));
  const nTri = buf ? new DataView(buf).getUint32(80, true) : 0;
  const ok = buf && nTri > 100 && buf.byteLength === 84 + nTri * 50;
  console.log(`${ok ? "OK   " : "FAIL "} stl export: ${nTri} triangles, ${buf ? buf.byteLength : 0} bytes`);
  if (!ok) fails++;
}

// breed 30 generations; every offspring must build non-degenerate
const evo = familyById("evolution");
const t0 = performance.now();
for (let round = 0; round < 30; round++) {
  rerollBrood();
  syncVariations(evo);
  if (evo.variations.length !== 9) {
    console.log("FAIL genetics: expected 9 variations, got", evo.variations.length);
    fails++;
    break;
  }
  for (const v of evo.variations) {
    try {
      const s = stats(evo.make(v));
      if (s.h < 0.05) throw new Error("degenerate build h=" + s.h);
    } catch (e) {
      console.log("FAIL genetics build:", v.name, v.axiom, JSON.stringify(v.rules), e.message);
      fails++;
    }
  }
  selectOffspring(Math.floor(Math.random() * 8));
}
console.log(
  `genetics: 30 generations bred+built in ${Math.round(performance.now() - t0)}ms, at generation ${getGeneration()}`,
);
reseedLineage();
syncVariations(evo);

console.log(fails ? `\n${fails} FAILURES` : "\nALL PASS");
Deno.exit(fails ? 1 : 0);
