// Floor-plan DSL. Loads museum/floorplan.yaml, validates every reference
// against the specimen catalog, resolves the door graph (return doors are
// derived), and hands the builders a normalized hall list. All museum layout
// flows from that file — adding an exhibit or a hall is a YAML edit.
import { load } from "js-yaml";
import { familyById } from "./specimens.js";
import { ACCENTS } from "./world.js";

const WALLS = ["north", "south", "east", "west"];
const OPPOSITE = { north: "south", south: "north", east: "west", west: "east" };
// each special room kind is backed by one dynamic family
const KIND_FAMILY = { greenhouse: "evolution", generations: "generations", vault: "vault" };

export async function loadPlan(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`floor plan: fetch failed (${res.status}) for ${url}`);
  return normalizePlan(load(await res.text()));
}

export function normalizePlan(doc) {
  if (!doc || !Array.isArray(doc.halls) || !doc.halls.length)
    throw new Error("floor plan: `halls` list missing or empty");
  if (!doc.entrance) throw new Error("floor plan: `entrance` missing");

  const halls = new Map();
  for (const raw of doc.halls) {
    if (!raw.id) throw new Error("floor plan: hall without an id");
    if (halls.has(raw.id)) throw new Error(`floor plan: duplicate hall id "${raw.id}"`);
    const kind = raw.kind || "gallery";
    if (kind !== "gallery" && !KIND_FAMILY[kind])
      throw new Error(`floor plan: hall "${raw.id}" has unknown kind "${kind}"`);
    const familyId = raw.family || KIND_FAMILY[kind];
    const family = familyId ? familyById(familyId) : null;
    if (familyId && !family)
      throw new Error(`floor plan: hall "${raw.id}" references unknown family "${familyId}"`);
    const exhibits = kind === "gallery" ? expandExhibits(raw, family) : [];
    halls.set(raw.id, {
      id: raw.id,
      kind,
      family,
      title: raw.title || (family && family.title) || raw.id,
      subtitle: raw.subtitle || (family && family.subtitle) || "",
      accent: raw.accent || accentFor(family, exhibits),
      width: raw.width || 11,
      plaque: raw.plaque || null,
      museumTitle: doc.title || "Museum",
      exhibits,
      doors: [],
      _declared: raw.doors || {},
    });
  }

  // explicit doors
  for (const hall of halls.values()) {
    for (const [wall, to] of Object.entries(hall._declared)) {
      if (!WALLS.includes(wall))
        throw new Error(`floor plan: hall "${hall.id}": "${wall}" is not a wall (north/south/east/west)`);
      if (to === hall.id) throw new Error(`floor plan: hall "${hall.id}" has a door to itself`);
      if (!halls.has(to))
        throw new Error(`floor plan: hall "${hall.id}": door to unknown hall "${to}"`);
      if (hall.doors.some((d) => d.to === to))
        throw new Error(`floor plan: hall "${hall.id}" declares two doors to "${to}"`);
      hall.doors.push({ wall, to });
    }
    delete hall._declared;
  }

  // derived return doors: opposite wall if free, else first free wall
  for (const hall of halls.values()) {
    for (const d of hall.doors) {
      const target = halls.get(d.to);
      if (target.doors.some((r) => r.to === hall.id)) continue;
      const wall = [OPPOSITE[d.wall], ...WALLS].find(
        (w) => !target.doors.some((r) => r.wall === w),
      );
      if (!wall)
        throw new Error(`floor plan: hall "${d.to}" has no free wall for the return door to "${hall.id}"`);
      target.doors.push({ wall, to: hall.id });
    }
  }

  // one door per wall
  for (const hall of halls.values()) {
    const seen = new Set();
    for (const d of hall.doors) {
      if (seen.has(d.wall))
        throw new Error(`floor plan: hall "${hall.id}" ends up with two doors on its ${d.wall} wall`);
      seen.add(d.wall);
    }
  }

  // wayfinding metadata on each door
  for (const hall of halls.values()) {
    for (const d of hall.doors) {
      const t = halls.get(d.to);
      d.label = t.title;
      d.accent = t.accent;
    }
  }

  // reachability from the entrance + entry wall (spawn side) per hall
  const entrance = halls.get(doc.entrance);
  if (!entrance) throw new Error(`floor plan: entrance "${doc.entrance}" is not a hall`);
  entrance.depth = 0;
  const queue = [entrance];
  while (queue.length) {
    const h = queue.shift();
    for (const d of h.doors) {
      const t = halls.get(d.to);
      if (t.depth === undefined) {
        t.depth = h.depth + 1;
        queue.push(t);
      }
    }
  }
  const orphans = [...halls.values()].filter((h) => h.depth === undefined);
  if (orphans.length)
    throw new Error(`floor plan: halls unreachable from the entrance: ${orphans.map((h) => h.id).join(", ")}`);
  for (const hall of halls.values()) {
    const back = hall.doors.find((d) => halls.get(d.to).depth < hall.depth);
    hall.entryWall = back ? back.wall : "south";
  }

  return {
    title: doc.title || "Museum",
    entranceId: doc.entrance,
    halls,
    order: [...halls.values()],
  };
}

function accentFor(family, exhibits) {
  const id = family ? family.id : exhibits.length ? exhibits[0].family.id : null;
  return (id && ACCENTS[id]) || "#6fbf59";
}

// "fam" → hero · "fam/*" → all · "fam/3" → by index · "fam/Name" → by name
function expandExhibits(raw, shorthandFamily) {
  const refs = raw.exhibits || (shorthandFamily ? [shorthandFamily.id + "/*"] : []);
  const out = [];
  for (const ref of refs) {
    if (typeof ref !== "string")
      throw new Error(`floor plan: hall "${raw.id}": exhibit refs must be strings, got ${JSON.stringify(ref)}`);
    const slash = ref.indexOf("/");
    const famId = slash < 0 ? ref : ref.slice(0, slash);
    const sel = slash < 0 ? undefined : ref.slice(slash + 1);
    const fam = familyById(famId);
    if (!fam) throw new Error(`floor plan: hall "${raw.id}": unknown family in "${ref}"`);
    if (fam.kind)
      throw new Error(`floor plan: hall "${raw.id}": "${famId}" is dynamic — use it as a hall kind, not an exhibit`);
    if (sel === "*") {
      fam.variations.forEach((_, vi) => out.push({ family: fam, vi }));
    } else if (sel === undefined) {
      out.push({ family: fam, vi: fam.heroIndex || 0 });
    } else if (/^\d+$/.test(sel)) {
      const vi = Number(sel);
      if (vi >= fam.variations.length)
        throw new Error(`floor plan: "${ref}": index out of range (family has ${fam.variations.length} variations)`);
      out.push({ family: fam, vi });
    } else {
      const vi = fam.variations.findIndex((v) => v.name === sel);
      if (vi < 0) throw new Error(`floor plan: "${ref}": no variation named "${sel}"`);
      out.push({ family: fam, vi });
    }
  }
  return out;
}
