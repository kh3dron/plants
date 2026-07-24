// 3D turtle interpreter: consumes a token stream ({cmd, param}) and produces
// a THREE.Group. Branch segments are merged into a single tapered-tube mesh;
// organs (leaves / flowers) are batched into InstancedMeshes per type.
import * as THREE from "three";

const DEG = Math.PI / 180;
const Y = new THREE.Vector3(0, 1, 0);

function rotate(vec, axis, deg) {
  vec.applyAxisAngle(axis, deg * DEG);
}

export function interpret(tokens, opts = {}) {
  const o = {
    mode: "plain",
    step: 1,
    lengthScale: 1,
    width: 0.06,
    taper: 0.78,
    widthScale: 1,
    radial: 7,
    material: "bark",
    trunkColor: new THREE.Color("#6b4a2b"),
    tipColor: new THREE.Color("#5fa64a"),
    neonColor: new THREE.Color("#78ffb0"),
    angle: 25,
    organs: {},
    ...opts,
  };

  const group = new THREE.Group();

  // Turtle frame.
  const pos = new THREE.Vector3(0, 0, 0);
  const H = new THREE.Vector3(0, 1, 0); // heading
  const U = new THREE.Vector3(0, 0, 1); // up
  const R = new THREE.Vector3(1, 0, 0); // right
  let width = o.width;

  const stack = [];
  const segments = []; // { p0, p1, r0, r1 }
  const organPlacements = {}; // type -> [{ pos, quat, size }]

  const pushOrgan = (spec) => {
    const list = (organPlacements[spec.type] = organPlacements[spec.type] || []);
    const quat = new THREE.Quaternion().setFromUnitVectors(Y, H.clone().normalize());
    list.push({ pos: pos.clone(), quat, size: spec.size, color: spec.color });
  };

  for (let i = 0; i < tokens.length; i++) {
    const { cmd, param } = tokens[i];
    const a = param != null ? param : o.angle;
    switch (cmd) {
      case "F":
      case "G": {
        const len = (param != null ? param : o.step) * o.lengthScale;
        const p0 = pos.clone();
        pos.addScaledVector(H, len);
        if (o.mode === "parametric") {
          segments.push({ p0, p1: pos.clone(), r0: width, r1: width }); // raw; scaled below
        } else {
          const r = o.width * Math.pow(o.taper, stack.length);
          segments.push({ p0, p1: pos.clone(), r0: r, r1: r * o.taper });
        }
        break;
      }
      case "f": {
        const len = (param != null ? param : o.step) * o.lengthScale;
        pos.addScaledVector(H, len);
        break;
      }
      case "!":
        if (param != null) width = param;
        break;
      case "+":
        rotate(H, U, a);
        rotate(R, U, a);
        break;
      case "-":
        rotate(H, U, -a);
        rotate(R, U, -a);
        break;
      case "&":
        rotate(H, R, a);
        rotate(U, R, a);
        break;
      case "^":
        rotate(H, R, -a);
        rotate(U, R, -a);
        break;
      case "/":
        rotate(R, H, a);
        rotate(U, H, a);
        break;
      case "\\":
        rotate(R, H, -a);
        rotate(U, H, -a);
        break;
      case "|":
        rotate(H, U, 180);
        rotate(R, U, 180);
        break;
      case "[":
        stack.push({ pos: pos.clone(), H: H.clone(), U: U.clone(), R: R.clone(), width });
        break;
      case "]": {
        const s = stack.pop();
        if (s) {
          pos.copy(s.pos);
          H.copy(s.H);
          U.copy(s.U);
          R.copy(s.R);
          width = s.width;
        }
        break;
      }
      default: {
        const spec = o.organs && o.organs[cmd];
        if (spec) pushOrgan(spec);
      }
    }
  }

  // Parametric templates use arbitrary width units; rescale so the trunk
  // reads as a sensible fraction of overall tree height.
  if (o.mode === "parametric" && segments.length) {
    let minY = Infinity;
    let maxY = -Infinity;
    let maxRaw = 0;
    for (const s of segments) {
      minY = Math.min(minY, s.p0.y, s.p1.y);
      maxY = Math.max(maxY, s.p0.y, s.p1.y);
      maxRaw = Math.max(maxRaw, s.r0, s.r1);
    }
    const height = Math.max(maxY - minY, 1e-3);
    const frac = o.trunkRadiusFrac || 0.03;
    const k = maxRaw > 0 ? (frac * height) / maxRaw : 1;
    for (const s of segments) {
      s.r0 = Math.max(s.r0 * k, 1e-4);
      s.r1 = Math.max(s.r1 * k, 1e-4);
    }
  }

  if (segments.length) group.add(buildTubes(segments, o));
  for (const type of Object.keys(organPlacements)) {
    const mesh = buildOrgans(type, organPlacements[type]);
    if (mesh) group.add(mesh);
  }

  return group;
}

function buildTubes(segments, o) {
  let maxR = 0;
  for (const s of segments) maxR = Math.max(maxR, s.r0, s.r1);
  maxR = maxR || 1;

  const radial = o.radial;
  const positions = [];
  const colors = [];
  const indices = [];
  let base = 0;

  const axis = new THREE.Vector3();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const ref = new THREE.Vector3();
  const c0 = new THREE.Color();
  const c1 = new THREE.Color();

  const colorFor = (r, out) => {
    if (o.material === "neon") return out.copy(o.neonColor);
    const t = THREE.MathUtils.clamp(r / maxR, 0, 1); // thick -> trunk, thin -> tip
    return out.copy(o.tipColor).lerp(o.trunkColor, t);
  };

  for (const s of segments) {
    axis.subVectors(s.p1, s.p0);
    const len = axis.length();
    if (len < 1e-6) continue;
    axis.normalize();
    ref.set(0, 0, 1);
    if (Math.abs(axis.dot(ref)) > 0.9) ref.set(1, 0, 0);
    u.crossVectors(axis, ref).normalize();
    v.crossVectors(axis, u).normalize();

    colorFor(s.r0, c0);
    colorFor(s.r1, c1);

    for (let k = 0; k < radial; k++) {
      const ang = (k / radial) * Math.PI * 2;
      const cx = Math.cos(ang);
      const sy = Math.sin(ang);
      // bottom ring
      positions.push(
        s.p0.x + (u.x * cx + v.x * sy) * s.r0,
        s.p0.y + (u.y * cx + v.y * sy) * s.r0,
        s.p0.z + (u.z * cx + v.z * sy) * s.r0,
      );
      colors.push(c0.r, c0.g, c0.b);
      // top ring
      positions.push(
        s.p1.x + (u.x * cx + v.x * sy) * s.r1,
        s.p1.y + (u.y * cx + v.y * sy) * s.r1,
        s.p1.z + (u.z * cx + v.z * sy) * s.r1,
      );
      colors.push(c1.r, c1.g, c1.b);
    }
    for (let k = 0; k < radial; k++) {
      const a0 = base + k * 2;
      const a1 = base + k * 2 + 1;
      const b0 = base + ((k + 1) % radial) * 2;
      const b1 = base + ((k + 1) % radial) * 2 + 1;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
    base += radial * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat =
    o.material === "neon"
      ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) // self-lit neon
      : new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.85,
          metalness: 0.02,
        });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const organGeoCache = {};

function organGeometry(type) {
  if (organGeoCache[type]) return organGeoCache[type];
  let g;
  if (type === "leaf") {
    g = new THREE.SphereGeometry(1, 8, 6);
    g.scale(0.42, 1, 0.12); // flattened blade, elongated along +Y
    g.translate(0, 0.7, 0);
  } else if (type === "petal") {
    g = new THREE.SphereGeometry(1, 8, 6);
    g.scale(0.35, 1.1, 0.1);
    g.translate(0, 0.9, 0);
  } else {
    g = new THREE.SphereGeometry(1, 10, 8); // flower / bud
  }
  organGeoCache[type] = g;
  return g;
}

function buildOrgans(type, placements) {
  if (!placements.length) return null;
  const geo = organGeometry(type);
  // Per-instance color comes from InstancedMesh.instanceColor; do NOT enable
  // vertexColors (there is no geometry color attribute, which would zero it).
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.6,
    metalness: 0.05,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, placements.length);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(placements.length * 3),
    3,
  );
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  placements.forEach((p, i) => {
    s.setScalar(p.size);
    m.compose(p.pos, p.quat, s);
    mesh.setMatrixAt(i, m);
    col.set(p.color || "#6cbf59");
    mesh.setColorAt(i, col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  return mesh;
}
