// Genome layer for the Evolution Greenhouse. A genome is a bracketed L-system
// grammar plus a turtle angle; broods are made by mutation, selection is done
// by the visitor walking up to the offspring they like (Dawkins' biomorphs,
// but botanical). The current lineage persists in localStorage.
import * as THREE from "three";
import { LSystem } from "./lsystem.js";

export const BROOD_SIZE = 8;
const STORE_KEY = "museum.evolution.lineage.v1";
const MAX_EXPANSION = 30000;

// the six canonical ABOP plants seed new lineages
const FOUNDERS = [
  { axiom: "F", rules: { F: "F[+F]F[-F]F" }, iterations: 4, angle: 25.7 },
  { axiom: "F", rules: { F: "F[+F]F[-F][F]" }, iterations: 4, angle: 20 },
  { axiom: "F", rules: { F: "FF-[-F+F+F]+[+F-F-F]" }, iterations: 4, angle: 22.5 },
  { axiom: "X", rules: { X: "F[+X]F[-X]+X", F: "FF" }, iterations: 5, angle: 20 },
  { axiom: "X", rules: { X: "F[+X][-X]FX", F: "FF" }, iterations: 5, angle: 25.7 },
  { axiom: "X", rules: { X: "F-[[X]+X]+F[+FX]-X", F: "FF" }, iterations: 4, angle: 22.5 },
];

function cloneGenome(g) {
  return {
    axiom: g.axiom,
    rules: { ...g.rules },
    iterations: g.iterations,
    angle: g.angle,
    droop: g.droop || 0,
  };
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function pick(list, rnd) {
  return list[Math.floor(rnd() * list.length)];
}

// rule to mutate, weighted by successor length so long rules attract edits
function pickRuleKey(g, rnd) {
  const keys = Object.keys(g.rules);
  if (!keys.length) return null;
  const weights = keys.map((k) => g.rules[k].length + 1);
  let r = rnd() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < keys.length; i++) {
    r -= weights[i];
    if (r <= 0) return keys[i];
  }
  return keys[keys.length - 1];
}

// matched [start, end] index pairs of every bracket group in a successor
function bracketGroups(s) {
  const groups = [];
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "[") stack.push(i);
    else if (s[i] === "]" && stack.length) groups.push([stack.pop(), i]);
  }
  return groups;
}

const MUTATIONS = [
  {
    w: 3.0,
    fn: (g, rnd) => {
      const d = (rnd() + rnd() - 1) * 7;
      if (Math.abs(d) < 0.3) return null;
      g.angle = clamp(+(g.angle + d).toFixed(1), 4, 60);
      return "δ " + g.angle + "°";
    },
  },
  {
    w: 1.6,
    fn: (g, rnd) => {
      // sprout: insert a new bracketed branch somewhere
      const key = pickRuleKey(g, rnd);
      if (!key) return null;
      const s = g.rules[key];
      const bodies = Object.keys(g.rules).concat("F");
      let body = pick(bodies, rnd);
      if (rnd() < 0.35) body += pick(bodies, rnd);
      const dir = rnd() < 0.5 ? "+" : "-";
      const at = Math.floor(rnd() * (s.length + 1));
      g.rules[key] = s.slice(0, at) + "[" + dir + body + "]" + s.slice(at);
      return "sprouted";
    },
  },
  {
    w: 1.0,
    fn: (g, rnd) => {
      // prune: delete one bracket group
      const key = pickRuleKey(g, rnd);
      if (!key) return null;
      const s = g.rules[key];
      const groups = bracketGroups(s);
      if (!groups.length) return null;
      const [a, b] = pick(groups, rnd);
      g.rules[key] = s.slice(0, a) + s.slice(b + 1);
      return "pruned";
    },
  },
  {
    w: 1.0,
    fn: (g, rnd) => {
      // double: repeat one bracket group in place
      const key = pickRuleKey(g, rnd);
      if (!key) return null;
      const s = g.rules[key];
      const groups = bracketGroups(s);
      if (!groups.length) return null;
      const [a, b] = pick(groups, rnd);
      g.rules[key] = s.slice(0, b + 1) + s.slice(a, b + 1) + s.slice(b + 1);
      return "doubled";
    },
  },
  {
    w: 1.0,
    fn: (g, rnd) => {
      // flip one turn
      const key = pickRuleKey(g, rnd);
      if (!key) return null;
      const s = g.rules[key];
      const turns = [];
      for (let i = 0; i < s.length; i++) if (s[i] === "+" || s[i] === "-") turns.push(i);
      if (!turns.length) return null;
      const i = pick(turns, rnd);
      g.rules[key] = s.slice(0, i) + (s[i] === "+" ? "-" : "+") + s.slice(i + 1);
      return "turn flipped";
    },
  },
  {
    w: 0.8,
    fn: (g, rnd) => {
      // stretch: an extra internode segment
      const key = pickRuleKey(g, rnd);
      if (!key) return null;
      const s = g.rules[key];
      const at = Math.floor(rnd() * (s.length + 1));
      g.rules[key] = s.slice(0, at) + "F" + s.slice(at);
      return "stretched";
    },
  },
  {
    w: 0.5,
    fn: (g, rnd) => {
      const d = rnd() < 0.5 ? -1 : 1;
      const n = clamp(g.iterations + d, 3, 6);
      if (n === g.iterations) return null;
      g.iterations = n;
      return "n=" + n;
    },
  },
  {
    w: 0.8,
    fn: (g, rnd) => {
      // tropism drift: lean into gravity or away from it
      const d = (rnd() + rnd() - 1) * 0.05;
      if (Math.abs(d) < 0.004) return null;
      g.droop = clamp(+((g.droop || 0) + d).toFixed(3), -0.08, 0.08);
      return g.droop >= 0 ? "droops " + g.droop : "reaches " + -g.droop;
    },
  },
];

function pickMutation(rnd) {
  let r = rnd() * MUTATIONS.reduce((a, m) => a + m.w, 0);
  for (const m of MUTATIONS) {
    r -= m.w;
    if (r <= 0) return m;
  }
  return MUTATIONS[0];
}

// A genome is viable if it expands to something drawable but bounded.
function viable(g) {
  let str;
  try {
    str = new LSystem(g.axiom, g.rules).generate(g.iterations);
  } catch {
    return false;
  }
  if (str.length > MAX_EXPANSION) return false;
  let f = 0;
  for (const c of str) if (c === "F") f++;
  return f >= 3;
}

export function makeChild(parent, rnd = Math.random) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const g = cloneGenome(parent);
    const n = rnd() < 0.6 ? 1 : 2;
    const descs = [];
    for (let i = 0; i < n; i++) {
      const d = pickMutation(rnd).fn(g, rnd);
      if (d) descs.push(d);
    }
    if (!descs.length) continue;
    if (viable(g)) return { genome: g, desc: descs.join(" · ") };
  }
  const g = cloneGenome(parent);
  g.angle = clamp(+(g.angle + (rnd() - 0.5) * 6).toFixed(1), 4, 60);
  return { genome: g, desc: "δ " + g.angle + "°" };
}

// --- lineage state --------------------------------------------------------

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d.parent?.axiom !== "string" || !d.parent.rules) return null;
    return { parent: cloneGenome(d.parent), generation: d.generation | 0 };
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(lineage));
  } catch {
    /* private mode etc. — breeding just won't persist */
  }
}

let lineage = load() || { parent: cloneGenome(FOUNDERS[4]), generation: 0 };
let brood = [];

export function getGeneration() {
  return lineage.generation;
}

export function rerollBrood() {
  brood = [];
  for (let i = 0; i < BROOD_SIZE; i++) brood.push(makeChild(lineage.parent));
}

export function selectOffspring(i) {
  if (!brood[i]) return;
  lineage = { parent: brood[i].genome, generation: lineage.generation + 1 };
  save();
  rerollBrood();
}

export function reseedLineage(rnd = Math.random) {
  lineage = { parent: cloneGenome(pick(FOUNDERS, rnd)), generation: 0 };
  save();
  rerollBrood();
}

// --- genome → catalog variation -------------------------------------------

const breederTurtle = (angle, droop) => ({
  material: "bark",
  radial: 6,
  step: 1,
  width: 0.08,
  taper: 0.72,
  radiusFrac: 0.02, // trunk = 2% of plant height, whatever the string length
  angle,
  droop: droop || 0,
  trunkColor: new THREE.Color("#7a5a3a"),
  tipColor: new THREE.Color("#e2a3ff"),
});

export function genomeToVariation(genome, name, note) {
  return {
    name,
    note,
    axiom: genome.axiom,
    rules: { ...genome.rules },
    iterations: genome.iterations,
    turtle: breederTurtle(genome.angle, genome.droop),
    height: 2.5,
  };
}

// Rewrite the family's variations from the live lineage: index 0 is the
// parent, 1..BROOD_SIZE the current brood. Focus mode and the hall hero read
// from the same array, so everything stays in step.
export function syncVariations(family) {
  if (!brood.length) rerollBrood();
  family.variations = [
    genomeToVariation(lineage.parent, "Parent", "generation " + lineage.generation),
    ...brood.map((b, i) => genomeToVariation(b.genome, "Offspring " + (i + 1), b.desc)),
  ];
}
