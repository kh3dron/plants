// Automatic evolution for the Hall of Generations. Fitness is computed from
// raw turtle segments — no meshes: canopy coverage (sunlight caught from
// above) minus wood volume minus lean, all normalized by plant height so
// genomes of wildly different string lengths compete fairly. The GA is a
// generator so the room can advance it a few evaluations per rendered frame.
import { LSystem, tokenizePlain } from "./lsystem.js";
import { traceSegments } from "./turtle.js";
import { makeChild, randomFounder, genomeToVariation } from "./genetics.js";

// weights calibrated by measuring founder-scale magnitudes in deno:
// coverage ~0.02-0.04, volume ~2e-5, lean ~0-0.25. Weighted so wood cost and
// lean each land at the same order as coverage.
const W_VOLUME = 300;
const W_LEAN = 0.35;

export function evaluate(genome) {
  let str;
  try {
    str = new LSystem(genome.axiom, genome.rules).generate(genome.iterations);
  } catch {
    return { fitness: -Infinity };
  }
  const { segments } = traceSegments(tokenizePlain(str), {
    step: 1,
    width: 0.08,
    taper: 0.72,
    angle: genome.angle,
    droop: genome.droop || 0,
  });
  if (segments.length < 3) return { fitness: -Infinity };

  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of segments) {
    minY = Math.min(minY, s.p0.y, s.p1.y);
    maxY = Math.max(maxY, s.p0.y, s.p1.y);
  }
  const H = maxY - minY;
  if (H < 1e-3) return { fitness: -Infinity };

  const cell = H / 18;
  const cols = new Set();
  let volume = 0;
  let cx = 0;
  let cz = 0;
  let wsum = 0;
  for (const s of segments) {
    const mx = (s.p0.x + s.p1.x) / 2;
    const my = (s.p0.y + s.p1.y) / 2;
    const mz = (s.p0.z + s.p1.z) / 2;
    const len = Math.hypot(s.p1.x - s.p0.x, s.p1.y - s.p0.y, s.p1.z - s.p0.z);
    const r = (s.r0 + s.r1) / 2;
    volume += r * r * len;
    cx += mx * len;
    cz += mz * len;
    wsum += len;
    // canopy: only the upper half of the plant catches meaningful light
    if (my - minY > H * 0.45) {
      cols.add((Math.round(mx / cell) + 2048) * 4096 + (Math.round(mz / cell) + 2048));
    }
  }
  const coverage = (cols.size * cell * cell) / (H * H);
  const vol = volume / (H * H * H);
  const lean = wsum > 0 ? (Math.abs(cx / wsum) + Math.abs(cz / wsum)) / H : 0;
  const fitness = coverage - W_VOLUME * vol - W_LEAN * lean;
  return { fitness, coverage, vol, lean };
}

function tournament(scored, rnd, k = 3) {
  let best = scored[Math.floor(rnd() * scored.length)];
  for (let i = 1; i < k; i++) {
    const c = scored[Math.floor(rnd() * scored.length)];
    if (c.f > best.f) best = c;
  }
  return best.g;
}

// Yields { type: "progress", gen, i, total }, { type: "champion", gen, genome,
// fitness } at checkpoints, then { type: "done", champions }.
export function* evolve(opts = {}) {
  const pop = opts.pop || 16;
  const generations = opts.generations || 16;
  const checkpoints = opts.checkpoints || [1, 2, 3, 5, 7, 10, 13, 16];
  const rnd = Math.random;

  let population = [];
  for (let i = 0; i < pop; i++) population.push(makeChild(randomFounder(rnd), rnd).genome);

  const champions = [];
  for (let gen = 1; gen <= generations; gen++) {
    const scored = [];
    for (let i = 0; i < population.length; i++) {
      scored.push({ g: population[i], f: evaluate(population[i]).fitness });
      yield { type: "progress", gen, i: i + 1, total: population.length };
    }
    scored.sort((a, b) => b.f - a.f);
    if (checkpoints.includes(gen)) {
      const champ = { gen, genome: scored[0].g, fitness: scored[0].f };
      champions.push(champ);
      yield { type: "champion", ...champ };
    }
    const next = [scored[0].g, scored[1].g]; // elitism
    while (next.length < pop) next.push(makeChild(tournament(scored, rnd), rnd).genome);
    population = next;
  }
  yield { type: "done", champions };
}

// --- persistence + family sync --------------------------------------------

const STORE_KEY = "museum.generations.v1";

export function loadChampions() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY));
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

export function saveChampions(champions) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(champions));
  } catch {
    /* no persistence — the run still displays */
  }
}

export function championVariation(c) {
  return genomeToVariation(
    c.genome,
    "Generation " + c.gen,
    "fitness " + (Number.isFinite(c.fitness) ? c.fitness.toFixed(3) : "—"),
  );
}

export function syncGenerationsVariations(family) {
  const champs = loadChampions();
  family.variations = champs.length
    ? champs.map(championVariation)
    : [genomeToVariation(randomFounder(), "Unevolved Founder", "run the hall to evolve")];
}
