// Mesh export for focus mode: binary STL written by hand (meshes and
// instanced meshes, world transforms applied), GLTF via the three.js addon.
// Points clouds (IFS) have no surface and are skipped by STL.
import * as THREE from "three";

function collectTriangles(root) {
  const tris = []; // flat [ax,ay,az, bx,by,bz, cx,cy,cz, ...]
  root.updateMatrixWorld(true);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const inst = new THREE.Matrix4();
  const world = new THREE.Matrix4();

  const emitGeometry = (geo, matrix) => {
    const posAttr = geo.getAttribute("position");
    if (!posAttr) return;
    const index = geo.getIndex();
    const count = index ? index.count : posAttr.count;
    for (let i = 0; i < count; i += 3) {
      const i0 = index ? index.getX(i) : i;
      const i1 = index ? index.getX(i + 1) : i + 1;
      const i2 = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(posAttr, i0).applyMatrix4(matrix);
      b.fromBufferAttribute(posAttr, i1).applyMatrix4(matrix);
      c.fromBufferAttribute(posAttr, i2).applyMatrix4(matrix);
      tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  };

  root.traverse((n) => {
    if (n.isInstancedMesh) {
      for (let k = 0; k < n.count; k++) {
        n.getMatrixAt(k, inst);
        world.multiplyMatrices(n.matrixWorld, inst);
        emitGeometry(n.geometry, world);
      }
    } else if (n.isMesh) {
      emitGeometry(n.geometry, n.matrixWorld);
    }
  });
  return tris;
}

export function exportSTL(root) {
  const tris = collectTriangles(root);
  const n = tris.length / 9;
  if (!n) return null;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, n, true);
  let o = 84;
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  for (let t = 0; t < n; t++) {
    const i = t * 9;
    ab.set(tris[i + 3] - tris[i], tris[i + 4] - tris[i + 1], tris[i + 5] - tris[i + 2]);
    ac.set(tris[i + 6] - tris[i], tris[i + 7] - tris[i + 1], tris[i + 8] - tris[i + 2]);
    nrm.crossVectors(ab, ac).normalize();
    dv.setFloat32(o, nrm.x, true);
    dv.setFloat32(o + 4, nrm.y, true);
    dv.setFloat32(o + 8, nrm.z, true);
    for (let v = 0; v < 9; v++) dv.setFloat32(o + 12 + v * 4, tris[i + v], true);
    o += 50; // 12 normal + 36 verts + 2 attribute bytes
  }
  return buf;
}

export async function exportGLB(root) {
  const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      root,
      (result) => resolve(result),
      (err) => reject(err),
      { binary: true },
    );
  });
}

export function downloadBlob(data, filename, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
