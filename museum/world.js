// Builds one hall at a time from the normalized floor plan (see plan.js /
// floorplan.yaml). Every hall is a rectangle: galleries lay their exhibits
// out in pedestal pairs along the side walls in list order and stretch to
// fit; the three special rooms (greenhouse, hall of generations, seed vault)
// keep their own machinery. Doors are carved into walls — main.js handles
// walking through them.
import * as THREE from "three";
import {
  getGeneration,
  getParentGenome,
  rerollBrood,
  selectOffspring,
  reseedLineage,
  syncVariations,
} from "./genetics.js";
import {
  evolve,
  loadChampions,
  saveChampions,
  championVariation,
  syncGenerationsVariations,
} from "./evolve.js";
import { vaultPlant, vaultList, syncVaultVariations } from "./vault.js";

const WALL_H = 6.2;
const DOOR_W = 2.6;
const DOOR_H = 3.6;
const SPACING = 4.6; // pedestal pitch along the gallery axis
const END_PAD = 3.2; // clear floor between the end walls and the first/last pair

// Free the GPU resources of a subtree that is being replaced. Only safe for
// objects whose geometry isn't shared (breeder plants and labels qualify —
// they never carry the cached organ geometries).
export function disposeObject(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) {
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of mats) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
}

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

// One wall in local space: spans x∈[-w/2, w/2], y∈[0, WALL_H], faces +z.
// A door carves an opening at the center and dresses it: glowing frame,
// destination label, dark portal, floor threshold strip.
function wallGroup(width, wallMat, door) {
  const g = new THREE.Group();
  const seg = (w, cx, cy, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(cx, cy, 0);
    m.receiveShadow = true;
    g.add(m);
  };
  if (!door) {
    seg(width, 0, WALL_H / 2, WALL_H);
    return g;
  }
  const side = (width - DOOR_W) / 2;
  seg(side, -(DOOR_W + side) / 2, WALL_H / 2, WALL_H);
  seg(side, (DOOR_W + side) / 2, WALL_H / 2, WALL_H);
  seg(DOOR_W, 0, (WALL_H + DOOR_H) / 2, WALL_H - DOOR_H);

  const accent = door.accent || "#6fbf59";
  const frameMat = new THREE.MeshStandardMaterial({
    color: "#101216",
    emissive: new THREE.Color(accent),
    emissiveIntensity: 0.85,
  });
  const postGeo = new THREE.BoxGeometry(0.09, DOOR_H, 0.09);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, frameMat);
    p.position.set(sx * (DOOR_W / 2 + 0.05), DOOR_H / 2, 0.04);
    g.add(p);
  }
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W + 0.2, 0.09, 0.09),
    frameMat,
  );
  lintel.position.set(0, DOOR_H + 0.05, 0.04);
  g.add(lintel);

  const portalMat = new THREE.MeshBasicMaterial({ color: "#04050a" });
  portalMat.fog = false;
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, DOOR_H), portalMat);
  portal.position.set(0, DOOR_H / 2, -0.06);
  g.add(portal);

  const label = makeLabel(door.label, "walk through", { accent, height: 0.42 });
  label.position.set(0, DOOR_H + 0.6, 0.1);
  g.add(label);

  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(DOOR_W, 0.5),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(accent),
      transparent: true,
      opacity: 0.28,
    }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, 0.015, 0.3);
  g.add(strip);
  return g;
}

function addShell(scene, halfX, halfZ, wallColor, doors = []) {
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
  const byWall = {};
  for (const d of doors) byWall[d.wall] = d;
  const put = (wall, width, x, z, ry) => {
    const g = wallGroup(width, wallMat, byWall[wall]);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(g);
  };
  put("north", halfX * 2, 0, -halfZ, 0);
  put("south", halfX * 2, 0, halfZ, Math.PI);
  put("west", halfZ * 2, -halfX, 0, Math.PI / 2);
  put("east", halfZ * 2, halfX, 0, -Math.PI / 2);

  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(halfX * 2, halfZ * 2),
    new THREE.MeshStandardMaterial({ color: "#15171d", roughness: 1 }),
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = WALL_H;
  scene.add(ceil);
}

function baseLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xbfd0ff, 0x2a2620, 0.85);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, 0.28);
  scene.add(amb);
}

function spotOver(scene, x, z, target, color, intensity) {
  const spot = new THREE.SpotLight(color || 0xfff4e0, intensity || 60, 12, Math.PI / 5.2, 0.55, 1.5);
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
  automata: "#5ad7ff",
  evolution: "#d98bff",
  colonization: "#ffb56f",
  particlelife: "#ff8fb0",
  reaction: "#57e6b8",
  dla: "#bfe8ff",
  lenia: "#9fffe0",
  generations: "#e8c96f",
  vault: "#b8e69a",
};

// --- location assembly ----------------------------------------------------

function spawnAt(wall, halfX, halfZ) {
  const IN = 1.7;
  if (wall === "south") return { pos: new THREE.Vector3(0, 1.6, halfZ - IN), yaw: Math.PI };
  if (wall === "north") return { pos: new THREE.Vector3(0, 1.6, -halfZ + IN), yaw: 0 };
  if (wall === "east") return { pos: new THREE.Vector3(halfX - IN, 1.6, 0), yaw: -Math.PI / 2 };
  return { pos: new THREE.Vector3(-halfX + IN, 1.6, 0), yaw: Math.PI / 2 };
}

function doorCenter(wall, halfX, halfZ) {
  if (wall === "north") return new THREE.Vector3(0, 1.6, -halfZ);
  if (wall === "south") return new THREE.Vector3(0, 1.6, halfZ);
  if (wall === "east") return new THREE.Vector3(halfX, 1.6, 0);
  return new THREE.Vector3(-halfX, 1.6, 0);
}

function finishLocation(hall, scene, halfX, halfZ, parts) {
  const doorways = hall.doors.map((d) => ({
    wall: d.wall,
    to: d.to,
    label: d.label,
    half: DOOR_W / 2 - 0.2,
    at: doorCenter(d.wall, halfX, halfZ),
    spawn: spawnAt(d.wall, halfX, halfZ),
  }));
  return {
    scene,
    hallId: hall.id,
    name: hall.title,
    sub: parts.sub || (parts.interactables || []).length + " exhibits",
    spawn: spawnAt(hall.entryWall, halfX, halfZ),
    bounds: { minX: -halfX + 0.6, maxX: halfX - 0.6, minZ: -halfZ + 0.6, maxZ: halfZ - 0.6 },
    walls: { north: -halfZ, south: halfZ, west: -halfX, east: halfX },
    doorways,
    colliders: parts.colliders || [],
    interactables: parts.interactables || [],
    animators: parts.animators || [],
    tickers: parts.tickers || [],
  };
}

export function buildLocation(hall) {
  if (hall.kind === "greenhouse") return buildBreederRoom(hall);
  if (hall.kind === "generations") return buildGenerationsRoom(hall);
  if (hall.kind === "vault") {
    syncVaultVariations(hall.family);
    const exhibits = hall.family.variations.map((_, vi) => ({ family: hall.family, vi }));
    return buildGallery(hall, exhibits, {
      emptySign: [
        "The vault is empty",
        "breed a plant in the Greenhouse · preserve it at its vault pedestal",
      ],
    });
  }
  return buildGallery(hall, hall.exhibits);
}

// --- gallery ---------------------------------------------------------------
// The hall's long axis follows the entry direction: you step in at one end
// and exhibits fill pedestal pairs along both side walls in list order,
// advancing toward the far end. The hall stretches to fit the list.

// inward unit vector of each entry wall, as [x, z]
const INWARD = { south: [0, -1], north: [0, 1], west: [1, 0], east: [-1, 0] };

function buildGallery(hall, exhibits, opts = {}) {
  const scene = new THREE.Scene();
  const accent = hall.accent;
  const bg = new THREE.Color("#0c0d11").lerp(new THREE.Color(accent), 0.07);
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 16, 40);

  const rows = Math.max(1, Math.ceil(exhibits.length / 2));
  const breadthHalf = hall.width / 2;
  const depthHalf = Math.max(5.5, (rows * SPACING + END_PAD * 2) / 2);
  const F = INWARD[hall.entryWall] || INWARD.south; // hall axis, entry → far end
  const R = [-F[1], F[0]]; // right hand of F
  const ew = F[0] !== 0;
  const halfX = ew ? depthHalf : breadthHalf;
  const halfZ = ew ? breadthHalf : depthHalf;
  // local → world: lx across the aisle, ld along it (entry end negative)
  const at = (lx, ld) => ({ x: R[0] * lx + F[0] * ld, z: R[1] * lx + F[1] * ld });

  addShell(scene, halfX, halfZ, "#2c313d", hall.doors);
  baseLighting(scene);
  scene.add(new THREE.HemisphereLight(new THREE.Color(accent), 0x000000, 0.16));

  const interactables = [];
  const colliders = [];
  const animators = [];
  const tickers = [];

  exhibits.forEach((ex, i) => {
    const side = i % 2 ? 1 : -1;
    const row = Math.floor(i / 2);
    const p = at(side * (breadthHalf - 2.1), (row - (rows - 1) / 2) * SPACING);
    const v = ex.family.variations[ex.vi];
    // aisle-facing yaw for this side
    const yaw = Math.atan2(-side * R[0], -side * R[1]);

    const ped = pedestal(accent);
    ped.group.position.set(p.x, 0, p.z);
    scene.add(ped.group);
    colliders.push({ x: p.x, z: p.z, r: 1.0 });

    let specimen;
    try {
      specimen = ex.family.make(v);
    } catch (e) {
      console.error("exhibit build failed", ex.family.id, v && v.name, e);
      specimen = new THREE.Group();
    }
    specimen.position.set(p.x, ped.topY, p.z);
    specimen.rotation.y = yaw;
    scene.add(specimen);
    if (specimen.userData.growth) animators.push(specimen);
    else if (specimen.userData.tick) tickers.push(specimen);

    spotOver(scene, p.x, ped.topY + 1.1, ped.topY + 0.9, 0xfff2df);

    const placard = makeLabel(v.name, v.note || "", { accent, height: 0.4 });
    placard.position.set(p.x - side * R[0] * 0.9, 1.16, p.z - side * R[1] * 0.9);
    placard.rotation.y = yaw;
    placard.rotateX(-0.16);
    scene.add(placard);

    interactables.push({
      focus: new THREE.Vector3(p.x, ped.topY + 0.9, p.z),
      title: v.name,
      ring: ped.ring,
      familyId: ex.family.id,
      variantIndex: ex.vi,
    });
  });

  // far-wall dressing faces back down the hall toward the entry
  const farYaw = Math.atan2(-F[0], -F[1]);
  const farAt = (ld, y) => {
    const p = at(0, ld);
    return new THREE.Vector3(p.x, y, p.z);
  };

  if (!exhibits.length) {
    spotOver(scene, 0, 2.2, 0.5, 0xfff2df, 40); // an empty hall still gets a pool of light
    if (opts.emptySign) {
      const sign = makeLabel(opts.emptySign[0], opts.emptySign[1], {
        accent,
        height: 0.9,
        bg: "#0d0f14",
      });
      sign.position.copy(farAt(depthHalf - 0.06, 2.6));
      sign.rotation.y = farYaw;
      sign.scale.setScalar(1.6);
      scene.add(sign);
    }
  }

  // hall title, high on the far wall (clear of any door label)
  const banner = makeLabel(hall.title, hall.subtitle, {
    accent,
    height: 0.9,
    bg: "#0d0f14",
  });
  banner.position.copy(farAt(depthHalf - 0.05, 5.3));
  banner.rotation.y = farYaw;
  banner.scale.setScalar(1.5);
  scene.add(banner);

  // entrance-style floor plaque
  if (hall.plaque) {
    const title = makeLabel(hall.museumTitle, hall.plaque, {
      accent,
      height: 0.7,
      bg: "#0d0f14",
    });
    title.position.set(0, 0.02, 0);
    title.rotation.x = -Math.PI / 2;
    title.rotateZ(Math.atan2(F[0], -F[1]));
    title.scale.setScalar(1.4);
    scene.add(title);
  }

  return finishLocation(hall, scene, halfX, halfZ, {
    colliders,
    interactables,
    animators,
    tickers,
  });
}

// --- evolution greenhouse -------------------------------------------------
// One parent pedestal, a fan of offspring pedestals, and a wild-seed pedestal
// to restart the lineage. Selecting an offspring rebuilds the exhibits in
// place; the room's scene is cached by main.js, so state lives here.

function buildBreederRoom(hall) {
  const family = hall.family;
  const scene = new THREE.Scene();
  const accent = hall.accent;
  const bg = new THREE.Color("#0c0d11").lerp(new THREE.Color(accent), 0.07);
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 16, 40);

  const halfX = 8;
  const halfZ = 8;
  addShell(scene, halfX, halfZ, "#2c313d", hall.doors);
  baseLighting(scene);
  scene.add(new THREE.HemisphereLight(new THREE.Color(accent), 0x000000, 0.16));

  const interactables = [];
  const colliders = [];

  // pedestal slots: 0 = parent (back center), 1..8 = brood fan facing it
  const slots = [];
  const P = { x: 0, z: -4.6 };
  const addSlot = (x, z, track = true) => {
    const ped = pedestal(accent);
    ped.group.position.set(x, 0, z);
    scene.add(ped.group);
    colliders.push({ x, z, r: 1.0 });
    // the fan packs ten pedestals close together — full-strength spots blow out
    spotOver(scene, x, ped.topY + 1.1, ped.topY + 0.9, 0xfff2df, 22);
    const slot = { x, z, topY: ped.topY, ring: ped.ring, group: null, placard: null };
    if (track) slots.push(slot); // untracked slots don't hold a brood variation
    return slot;
  };

  addSlot(P.x, P.z);
  const FAN_R = 5.4;
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * 0.42 + (i / 7) * Math.PI * 0.84;
    addSlot(P.x + Math.sin(a) * FAN_R, P.z + Math.cos(a) * FAN_R);
  }

  let genPlaque = null;

  const rebuildExhibits = () => {
    syncVariations(family);
    slots.forEach((slot, idx) => {
      const v = family.variations[idx];
      if (slot.group) {
        scene.remove(slot.group);
        disposeObject(slot.group);
      }
      let specimen;
      try {
        specimen = family.make(v);
      } catch (e) {
        console.error("brood build failed", v.name, e);
        specimen = new THREE.Group();
      }
      specimen.position.set(slot.x, slot.topY, slot.z);
      scene.add(specimen);
      slot.group = specimen;

      if (slot.placard) {
        scene.remove(slot.placard);
        disposeObject(slot.placard);
      }
      const placard = makeLabel(v.name, v.note || "", { accent, height: 0.4 });
      placard.position.set(slot.x, 1.16, slot.z + 0.85);
      placard.rotateX(-0.16);
      scene.add(placard);
      slot.placard = placard;

      if (interactables[idx]) interactables[idx].title = v.name;
    });

    if (genPlaque) {
      scene.remove(genPlaque);
      disposeObject(genPlaque);
    }
    genPlaque = makeLabel("Generation " + getGeneration(), "walk to an offspring · E selects it as the next parent", {
      accent,
      height: 0.8,
      bg: "#0d0f14",
    });
    genPlaque.position.set(0, 4.4, -halfZ + 0.06);
    genPlaque.scale.setScalar(1.7);
    scene.add(genPlaque);
  };

  slots.forEach((slot, idx) => {
    const it = {
      focus: new THREE.Vector3(slot.x, slot.topY + 0.9, slot.z),
      title: "",
      ring: slot.ring,
      familyId: family.id,
      variantIndex: idx,
    };
    if (idx === 0) {
      it.actionLabel = "breed a new brood";
      it.action = () => {
        rerollBrood();
        rebuildExhibits();
      };
    } else {
      it.actionLabel = "select as parent";
      it.action = () => {
        selectOffspring(idx - 1);
        rebuildExhibits();
      };
    }
    interactables.push(it);
  });

  // wild seed: a glowing kernel that restarts the lineage from a founder
  const wild = addSlot(halfX - 2.4, halfZ - 3.2, false);
  const kernel = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.22, 1),
    new THREE.MeshStandardMaterial({
      color: "#3a2c14",
      roughness: 0.4,
      emissive: new THREE.Color(accent),
      emissiveIntensity: 0.5,
    }),
  );
  kernel.position.set(wild.x, wild.topY + 0.25, wild.z);
  kernel.castShadow = true;
  scene.add(kernel);
  const wildPlacard = makeLabel("Wild Seed", "restart from a founder", { accent, height: 0.36 });
  wildPlacard.position.set(wild.x, 1.16, wild.z + 0.85);
  wildPlacard.rotateX(-0.16);
  scene.add(wildPlacard);
  interactables.push({
    focus: new THREE.Vector3(wild.x, wild.topY + 0.4, wild.z),
    title: "Wild Seed",
    ring: wild.ring,
    familyId: null,
    actionLabel: "start a fresh lineage",
    action: () => {
      reseedLineage();
      rebuildExhibits();
    },
  });

  // seed vault deposit: preserve the current parent for the Vault room
  const dep = addSlot(-(halfX - 2.4), halfZ - 3.2, false);
  const depGem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.2, 0),
    new THREE.MeshStandardMaterial({
      color: "#2c3a24",
      roughness: 0.35,
      emissive: new THREE.Color("#b8e69a"),
      emissiveIntensity: 0.45,
    }),
  );
  depGem.position.set(dep.x, dep.topY + 0.24, dep.z);
  depGem.castShadow = true;
  scene.add(depGem);
  let depPlacard = makeLabel("Seed Vault", vaultList().length + " preserved", {
    accent: "#b8e69a",
    height: 0.36,
  });
  depPlacard.position.set(dep.x, 1.16, dep.z + 0.85);
  depPlacard.rotateX(-0.16);
  scene.add(depPlacard);
  interactables.push({
    focus: new THREE.Vector3(dep.x, dep.topY + 0.4, dep.z),
    title: "Seed Vault",
    ring: dep.ring,
    familyId: null,
    actionLabel: "preserve the parent",
    action: () => {
      const n = vaultPlant(getParentGenome(), "Greenhouse · Gen " + getGeneration());
      scene.remove(depPlacard);
      disposeObject(depPlacard);
      depPlacard = makeLabel("Seed Vault", n + " preserved", { accent: "#b8e69a", height: 0.36 });
      depPlacard.position.set(dep.x, 1.16, dep.z + 0.85);
      depPlacard.rotateX(-0.16);
      scene.add(depPlacard);
      document.dispatchEvent(new CustomEvent("room-stale", { detail: { id: "vault" } }));
    },
  });

  rebuildExhibits();

  const banner = makeLabel(hall.title, hall.subtitle, {
    accent,
    height: 1.0,
    bg: "#0d0f14",
  });
  banner.position.set(0, 5.5, -halfZ + 0.06);
  banner.scale.setScalar(2.0);
  scene.add(banner);

  return finishLocation(hall, scene, halfX, halfZ, {
    colliders,
    interactables,
    sub: "artificial selection",
  });
}

// --- hall of generations ---------------------------------------------------
// A corridor through evolutionary time: sow 16 wild seeds, and a GA runs a
// few fitness evaluations per rendered frame while you watch. Checkpoint
// champions take their pedestals as their generation completes.

const CHECKPOINTS = [1, 2, 3, 5, 7, 10, 13, 16];

function buildGenerationsRoom(hall) {
  const family = hall.family;
  const scene = new THREE.Scene();
  const accent = hall.accent;
  const bg = new THREE.Color("#0c0d11").lerp(new THREE.Color(accent), 0.07);
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 16, 44);

  const halfX = 7;
  const halfZ = 11;
  addShell(scene, halfX, halfZ, "#2c313d", hall.doors);
  baseLighting(scene);
  scene.add(new THREE.HemisphereLight(new THREE.Color(accent), 0x000000, 0.14));

  const interactables = [];
  const colliders = [];
  const tickers = [];

  // champion slots: two columns, generations ascend as you walk north
  const slots = [];
  for (let i = 0; i < CHECKPOINTS.length; i++) {
    const x = i % 2 === 0 ? -3.6 : 3.6;
    const z = 2.2 - Math.floor(i / 2) * 3.4;
    const ped = pedestal(accent);
    ped.group.position.set(x, 0, z);
    scene.add(ped.group);
    colliders.push({ x, z, r: 1.0 });
    spotOver(scene, x, ped.topY + 1.1, ped.topY + 0.9, 0xfff2df, 40);
    const slot = { x, z, topY: ped.topY, ring: ped.ring, group: null, placard: null };
    slots.push(slot);
    interactables.push({
      focus: new THREE.Vector3(x, ped.topY + 0.9, z),
      title: "Generation " + CHECKPOINTS[i],
      ring: ped.ring,
      familyId: null, // set once a champion stands here
      variantIndex: i,
    });
  }

  const setSlot = (i, variation) => {
    const slot = slots[i];
    if (slot.group) {
      scene.remove(slot.group);
      disposeObject(slot.group);
      slot.group = null;
    }
    if (slot.placard) {
      scene.remove(slot.placard);
      disposeObject(slot.placard);
    }
    let title = "Generation " + CHECKPOINTS[i];
    let note = "not yet grown";
    if (variation) {
      try {
        const specimen = family.make(variation);
        specimen.position.set(slot.x, slot.topY, slot.z);
        scene.add(specimen);
        slot.group = specimen;
      } catch (e) {
        console.error("champion build failed", e);
      }
      title = variation.name;
      note = variation.note || "";
      interactables[i].familyId = family.id;
      interactables[i].title = variation.name;
    }
    const placard = makeLabel(title, note, { accent, height: 0.4 });
    placard.position.set(slot.x, 1.16, slot.z + 0.85);
    placard.rotateX(-0.16);
    scene.add(placard);
    slot.placard = placard;
  };

  // populate from the last saved run
  const saved = loadChampions();
  saved.forEach((c, i) => {
    if (i < slots.length) setSlot(i, championVariation(c));
  });
  for (let i = saved.length; i < slots.length; i++) setSlot(i, null);

  // status plaque over the run pedestal
  let statusPlacard = null;
  const setStatus = (title, note) => {
    if (statusPlacard) {
      scene.remove(statusPlacard);
      disposeObject(statusPlacard);
    }
    statusPlacard = makeLabel(title, note, { accent, height: 0.6, bg: "#0d0f14" });
    statusPlacard.position.set(0, 2.6, 5.2);
    scene.add(statusPlacard);
  };
  setStatus(
    saved.length ? "Last run preserved" : "No run yet",
    "E on the sower to evolve 16 generations",
  );

  // the sower
  const sow = pedestal(accent);
  sow.group.position.set(0, 0, 5.2);
  scene.add(sow.group);
  colliders.push({ x: 0, z: 5.2, r: 1.0 });
  spotOver(scene, 0, sow.topY + 1.1, sow.topY + 0.9, 0xfff2df, 40);
  const seeds = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.22, 1),
    new THREE.MeshStandardMaterial({
      color: "#3a2c14",
      roughness: 0.4,
      emissive: new THREE.Color(accent),
      emissiveIntensity: 0.5,
    }),
  );
  seeds.position.set(0, sow.topY + 0.25, 5.2);
  seeds.castShadow = true;
  scene.add(seeds);

  let iter = null;
  let shownGen = 0;
  let champCount = 0;
  const machine = {
    userData: {
      tick: () => {
        if (!iter) return;
        for (let k = 0; k < 3 && iter; k++) {
          const { value, done } = iter.next();
          if (done || !value) {
            iter = null;
            break;
          }
          if (value.type === "progress" && value.gen !== shownGen) {
            shownGen = value.gen;
            setStatus("Evolving", "generation " + value.gen + " / 16");
          } else if (value.type === "champion") {
            setSlot(champCount, championVariation(value));
            champCount++;
          } else if (value.type === "done") {
            saveChampions(value.champions);
            syncGenerationsVariations(family);
            setStatus("Run complete", "fittest: " + value.champions[value.champions.length - 1].fitness.toFixed(3));
            iter = null;
          }
        }
      },
    },
  };
  tickers.push(machine);

  interactables.push({
    focus: new THREE.Vector3(0, sow.topY + 0.4, 5.2),
    title: "The Sower",
    ring: sow.ring,
    familyId: null,
    actionLabel: "sow 16 wild seeds",
    action: () => {
      iter = evolve({});
      shownGen = 0;
      champCount = 0;
      for (let i = 0; i < slots.length; i++) setSlot(i, null);
      setStatus("Evolving", "sowing…");
    },
  });

  const banner = makeLabel(hall.title, hall.subtitle, { accent, height: 1.0, bg: "#0d0f14" });
  banner.position.set(0, 3.6, -halfZ + 0.06);
  banner.scale.setScalar(2.2);
  scene.add(banner);

  return finishLocation(hall, scene, halfX, halfZ, {
    colliders,
    interactables,
    tickers,
    sub: "selection without an eye",
  });
}
