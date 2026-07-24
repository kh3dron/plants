// Builds the two kinds of locations: the main hall (one pedestal per family)
// and a per-family room (a grid of that family's permutations). Each builder
// returns a scene plus the metadata main.js needs for movement, collision and
// interaction.
import * as THREE from "three";
import { FAMILIES } from "./specimens.js";

const WALL_H = 6.2;

// --- shared materials & textures -----------------------------------------

function floorTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#2b2b31";
  g.fillRect(0, 0, 512, 512);
  // large marble-ish tiles
  const tile = 128;
  for (let y = 0; y < 512; y += tile) {
    for (let x = 0; x < 512; x += tile) {
      const shade = 38 + Math.floor(((x / tile + y / tile) % 2) * 8);
      g.fillStyle = `rgb(${shade},${shade},${shade + 4})`;
      g.fillRect(x + 2, y + 2, tile - 4, tile - 4);
    }
  }
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 3;
  for (let i = 0; i <= 512; i += tile) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 512);
    g.moveTo(0, i);
    g.lineTo(512, i);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeLabel(title, subtitle, opts = {}) {
  const W = 512;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  // plaque
  g.fillStyle = opts.bg || "#14161c";
  roundRect(g, 6, 6, W - 12, H - 12, 18);
  g.fill();
  g.strokeStyle = opts.accent || "#6fbf59";
  g.lineWidth = 4;
  roundRect(g, 6, 6, W - 12, H - 12, 18);
  g.stroke();

  g.textAlign = "center";
  g.fillStyle = "#f2f3ee";
  g.font = "600 40px Georgia, 'Times New Roman', serif";
  wrapText(g, title, W / 2, 96, W - 60, 44);

  if (subtitle) {
    g.fillStyle = opts.accent || "#9bd88a";
    g.font = "500 26px 'Courier New', monospace";
    g.fillText(subtitle, W / 2, H - 46, W - 50);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const aspect = W / H;
  const h = opts.height || 0.5;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), mat);
  return plane;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wrapText(g, text, x, y, maxW, lh) {
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (g.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  lines.push(line);
  const startY = y - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => g.fillText(l, x, startY + i * lh));
}

// --- building blocks ------------------------------------------------------

function pedestal(accent) {
  const grp = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({
    color: "#d9d4c8",
    roughness: 0.85,
    metalness: 0.02,
  });
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.62, 1.0, 24),
    stoneMat,
  );
  shaft.position.y = 0.5;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  grp.add(shaft);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.68, 0.68, 0.12, 24),
    stoneMat,
  );
  cap.position.y = 1.06;
  cap.castShadow = true;
  grp.add(cap);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.72, 0.12, 24),
    stoneMat,
  );
  base.position.y = 0.06;
  grp.add(base);

  // glow ring (hidden until near)
  const ringMat = new THREE.MeshBasicMaterial({
    color: accent || "#6fbf59",
    transparent: true,
    opacity: 0,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.98, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.13;
  grp.add(ring);

  return { group: grp, ring, topY: 1.12 };
}

function addRoomShell(scene, halfX, halfZ, wallColor) {
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTexture(),
    roughness: 0.9,
    metalness: 0.0,
  });
  floorMat.map.repeat.set(halfX, halfZ);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(halfX * 2, halfZ * 2),
    floorMat,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor || "#3a3f4b",
    roughness: 0.95,
    side: THREE.FrontSide,
  });
  const mkWall = (w, x, z, ry) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, WALL_H), wallMat);
    wall.position.set(x, WALL_H / 2, z);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    scene.add(wall);
  };
  mkWall(halfX * 2, 0, -halfZ, 0); // north (faces +z)
  mkWall(halfX * 2, 0, halfZ, Math.PI); // south
  mkWall(halfZ * 2, -halfX, 0, Math.PI / 2); // west
  mkWall(halfZ * 2, halfX, 0, -Math.PI / 2); // east

  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(halfX * 2, halfZ * 2),
    new THREE.MeshStandardMaterial({ color: "#15171d", roughness: 1 }),
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = WALL_H;
  scene.add(ceil);

  // baseboard trim
  const trimMat = new THREE.MeshStandardMaterial({ color: "#20232b" });
  const trimGeo = new THREE.BoxGeometry(halfX * 2, 0.25, 0.08);
  [
    [0, -halfZ + 0.05, 0],
    [0, halfZ - 0.05, 0],
  ].forEach(([x, z]) => {
    const t = new THREE.Mesh(trimGeo, trimMat);
    t.position.set(x, 0.12, z);
    scene.add(t);
  });
}

function baseLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xbfd0ff, 0x2a2620, 0.85);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, 0.28);
  scene.add(amb);
}

function spotOver(scene, x, z, target, color) {
  const spot = new THREE.SpotLight(color || 0xfff4e0, 60, 12, Math.PI / 5.2, 0.55, 1.5);
  spot.position.set(x, WALL_H - 0.4, z);
  spot.target.position.set(x, target, z);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.5;
  spot.shadow.camera.far = 12;
  scene.add(spot);
  scene.add(spot.target);
  return spot;
}

export const ACCENTS = {
  fractals: "#7dffc0",
  trees2d: "#8fe06a",
  trees3d: "#c8a06a",
  racemes: "#ffb3d9",
  phyllotaxis: "#ffcf3f",
  leaves: "#8fe06a",
  ifs: "#9dffb8",
  development: "#8fd0ff",
  cells: "#9ad86a",
};

// --- hall -----------------------------------------------------------------

export function buildHall() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0e0f14");
  scene.fog = new THREE.Fog("#0e0f14", 14, 34);

  const half = 12;
  addRoomShell(scene, half, half, "#343947");
  baseLighting(scene);

  const interactables = [];
  const spinners = [];
  const colliders = [];
  const animators = [];

  const R = 7.2;
  const n = FAMILIES.length;
  FAMILIES.forEach((fam, i) => {
    const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const x = Math.cos(ang) * R;
    const z = Math.sin(ang) * R;
    const accent = ACCENTS[fam.id] || "#6fbf59";

    const ped = pedestal(accent);
    ped.group.position.set(x, 0, z);
    scene.add(ped.group);
    colliders.push({ x, z, r: 1.05 });

    let specimen;
    try {
      specimen = fam.make(fam.variations[fam.heroIndex]);
    } catch (e) {
      console.error("hero build failed", fam.id, e);
      specimen = new THREE.Group();
    }
    specimen.position.set(x, ped.topY, z);
    scene.add(specimen);
    if (specimen.userData.growth) animators.push(specimen);
    else if (fam.spin !== false) spinners.push(specimen);

    spotOver(scene, x, ped.topY + 1.2, ped.topY + 1, 0xfff2df);

    // placard, angled up, facing room center
    const placard = makeLabel(fam.title, fam.subtitle, {
      accent,
      height: 0.46,
    });
    const inward = new THREE.Vector3(-x, 0, -z).normalize();
    placard.position.set(x + inward.x * 0.75, 1.2, z + inward.z * 0.75);
    placard.lookAt(0, 1.2, 0);
    placard.rotateX(-0.18);
    scene.add(placard);

    interactables.push({
      focus: new THREE.Vector3(x, ped.topY + 1, z),
      enterId: fam.id,
      title: fam.title,
      ring: ped.ring,
      familyId: fam.id,
      variantIndex: fam.heroIndex,
    });
  });

  // central hall title on the floor / marker
  const title = makeLabel(
    "The Algorithmic Beauty of Plants",
    "walk up to a specimen · press E to enter",
    { accent: "#9bd88a", height: 0.7, bg: "#0d0f14" },
  );
  title.position.set(0, 0.02, 0);
  title.rotation.x = -Math.PI / 2;
  title.scale.setScalar(1.4);
  scene.add(title);

  return {
    scene,
    spawn: { pos: new THREE.Vector3(0, 1.6, half - 2.2), yaw: Math.PI },
    bounds: { minX: -half + 0.6, maxX: half - 0.6, minZ: -half + 0.6, maxZ: half - 0.6 },
    colliders,
    interactables,
    spinners,
    animators,
  };
}

// --- family room ----------------------------------------------------------

export function buildRoom(family) {
  const scene = new THREE.Scene();
  const accent = ACCENTS[family.id] || "#6fbf59";
  scene.background = new THREE.Color("#0c0d11");

  const items = family.variations;
  const cols = Math.min(3, items.length);
  const rows = Math.ceil(items.length / cols);
  const spacingX = 4.2;
  const spacingZ = 4.6;
  const halfX = Math.max(7, (cols * spacingX) / 2 + 2.5);
  const halfZ = Math.max(8, (rows * spacingZ) / 2 + 4);

  scene.fog = new THREE.Fog("#0c0d11", 16, 40);
  addRoomShell(scene, halfX, halfZ, "#2c313d");
  baseLighting(scene);

  const interactables = [];
  const spinners = [];
  const colliders = [];
  const animators = [];

  const gridW = (cols - 1) * spacingX;
  const gridD = (rows - 1) * spacingZ;
  items.forEach((v, i) => {
    const cx = i % cols;
    const cz = Math.floor(i / cols);
    const x = cx * spacingX - gridW / 2;
    const z = cz * spacingZ - gridD / 2 - 1.2;

    const ped = pedestal(accent);
    ped.group.position.set(x, 0, z);
    scene.add(ped.group);
    colliders.push({ x, z, r: 1.0 });

    let specimen;
    try {
      specimen = family.make(v);
    } catch (e) {
      console.error("variation build failed", family.id, v.name, e);
      specimen = new THREE.Group();
    }
    specimen.position.set(x, ped.topY, z);
    scene.add(specimen);
    if (specimen.userData.growth) animators.push(specimen);
    else if (family.spin !== false) spinners.push(specimen);

    spotOver(scene, x, ped.topY + 1.1, ped.topY + 0.9, 0xfff2df);

    const placard = makeLabel(v.name, v.note || "", { accent, height: 0.4 });
    placard.position.set(x, 1.16, z + 0.85);
    placard.rotateX(-0.16);
    scene.add(placard);

    interactables.push({
      focus: new THREE.Vector3(x, ped.topY + 0.9, z),
      enterId: null,
      title: v.name,
      ring: ped.ring,
      familyId: family.id,
      variantIndex: i,
    });
  });

  // title banner on the north wall
  const banner = makeLabel(family.title, family.subtitle, {
    accent,
    height: 1.0,
    bg: "#0d0f14",
  });
  banner.position.set(0, 3.4, -halfZ + 0.06);
  banner.scale.setScalar(2.2);
  scene.add(banner);

  // exit marker near spawn
  const exit = makeLabel("← EXIT TO HALL", "press E or Esc", {
    accent: "#ff9d6f",
    height: 0.5,
    bg: "#0d0f14",
  });
  exit.position.set(0, 1.5, halfZ - 0.1);
  exit.rotation.y = Math.PI;
  scene.add(exit);

  return {
    scene,
    spawn: { pos: new THREE.Vector3(0, 1.6, halfZ - 2), yaw: Math.PI },
    bounds: { minX: -halfX + 0.6, maxX: halfX - 0.6, minZ: -halfZ + 0.6, maxZ: halfZ - 0.6 },
    colliders,
    interactables,
    spinners,
    animators,
    exit: true,
  };
}
