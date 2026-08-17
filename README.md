# Plants

Working through [The Algorithmic Beauty of Plants](https://algorithmicbotany.org/papers/abop/abop.pdf) (ABOP), plus a growing wing of adjacent emergent algorithms.

Live: [kh3dron.github.io/plants](https://kh3dron.github.io/plants/)

## 1.0 Museum

`index.html` + `museum/` — a walkable first-person 3D museum. three.js 0.160 + js-yaml 4.1 via CDN import map, ES modules, no build step.

No entry gate: the page boots straight into the atrium, with a transient title card that never blocks input. Mouse capture: a clean click (or any movement key) requests pointer lock; dragging looks around without capturing; `Esc` frees the cursor (a resume pill appears, and relock retries once past the browser's ~1.3s cooldown); closing the focus panel or directory recaptures automatically.

Controls: `WASD` move · walk into a doorway to change halls · `E` act (breeder pedestals etc.) · `F` focus an exhibit · `M` hall directory · `P` photo mode · `T` guided tour · `Backspace` return to the atrium.

Focus mode gives sliders and a grammar editor per exhibit; the copy-link button encodes the full edited grammar in the URL, and GLB/STL buttons export the specimen mesh (STL is hand-written binary; point clouds are refused).

### 1.1 Floor plan DSL

The building is data: `museum/floorplan.yaml` declares a graph of rectangular halls connected by doors. `plan.js` loads and validates it; `world.js` builds one hall at a time. Nothing is positioned by hand and there is no procedural placement (no rings, no random scatter) — layout inside a hall is a pure function of the exhibit list order.

- HALL: `id`, plus either `family: <specimens.js id>` (shorthand: every variation, inherited title/subtitle/accent) or an ordered `exhibits:` list.
- EXHIBIT REFS: `fam` (hero) · `fam/*` (all variations) · `fam/3` (by index) · `fam/Koch Snowflake` (by name).
- DOORS: `doors: { north: other-hall }`, walls north/south/east/west, one door per wall. Declare on one side only; the return door is derived (opposite wall if free). Halls are separate scenes, so wall coordinates never collide between halls.
- KIND: `gallery` (default) | `greenhouse` | `generations` | `vault` — the three stateful special rooms.
- LAYOUT: a gallery's long axis follows its entry direction; exhibits fill pedestal pairs along the side walls in list order and the hall stretches to fit. Appending an exhibit = one line; inserting next to an existing one = one line at that position; a new hall = one block + one door line.
- VALIDATION: unknown families/variations, door conflicts, and halls unreachable from `entrance` are hard errors at load (shown on screen) and covered by the headless test.

### 1.2 Halls

Three wings off the atrium: the book (north), emergence (east), the living collection (west).

| Hall | Content | Source |
|---|---|---|
| Fractal Curves | ABOP ch. 1 edge-rewriting curves, framed | `specimens.js` |
| Bracketed Axial Trees | ABOP fig. 1.24 plants a–f | `specimens.js` |
| Three-Dimensional Trees | Honda / Aono–Kunii parametric models | `specimens.js` |
| Racemes | ABOP ch. 3 inflorescences with organs | `specimens.js` |
| Phyllotaxis | Vogel spirals, pinecone cylinder | `specimens.js` |
| Compound Leaves | pinnate / bipinnate / palmate | `specimens.js` |
| Space Colonization | Runions attractor trees (open/dense/columnar/windswept), Honda comparison, framed leaf venation | `colonize.js` |
| Iterated Function Systems | chaos-game point clouds | `specimens.js` |
| Development | staged growth animations | `specimens.js` |
| Cellular Layers | map-L-system-spirit tissue mosaics | `specimens.js` |
| Cellular Automata | Wolfram rules 30/90/110 panels; Game of Life time towers (R-pentomino, acorn, Gosper gun) — generation = vertical layer; Abelian sandpile | `specimens.js` |
| Particle Life | live vitrines: 5 species, asymmetric attraction matrix | `particlelife.js` |
| Reaction–Diffusion | live Gray–Scott panels (mitosis/coral/solitons/maze/worms), GPU ping-pong | `reaction.js` |
| Lenia | continuous CA on GPU; 5 regimes selected by a CPU survival search | `lenia.js` |
| Diffusion-Limited Aggregation | coral, sea fan, framed dendrite + frost | `dla.js` |
| Evolution Greenhouse | interactive selective breeding of bracketed grammars | `genetics.js`, breeder room in `world.js` |
| Hall of Generations | automatic evolution: sow 16 wild seeds, fitness = canopy − wood − lean, checkpoint champions fill pedestals live | `evolve.js` |
| Seed Vault | lineages preserved from the Greenhouse, on permanent display | `vault.js` |

The turtle supports tropism (ABOP eq. 2.1): a signed `droop` bends every segment toward or away from gravity — exposed as a slider on the tree families and heritable in the greenhouse. Live exhibits run through a `userData.tick(dt, ctx)` hook driven by the hall/focus render loops (`ctx.renderer` for GPU sims).

### 1.3 Evolution Greenhouse

Dawkins-biomorph selection over L-system genomes (axiom, rules, iterations, angle). One parent pedestal, eight mutant offspring, a wild-seed pedestal to restart from an ABOP founder. `E` on an offspring makes it the next parent. Mutation operators: branch insert / prune / duplicate, turn flip, segment insert, angle jitter, iteration depth. Offspring are validated against an expansion budget before display. Lineage persists in `localStorage`.

### 1.4 Pollinators

`pollinators.js` — instanced boid moths (separation / alignment / cohesion, weak attraction to exhibits, soft wall springs) drift through every location.

## 2.0 Classic 2D pages

`chapters/` — standalone per-chapter demos, indexed at `chapters.html`. `programs.md` tracks book coverage.

## 3.0 Dev

- Serve statically: `python3 -m http.server` (or `make build && make run` for Docker).
- Headless regression test (builds every catalog specimen, ticks live sims 120 frames, breeds 30 generations, validates `floorplan.yaml`; no WebGL needed):
  `deno run --import-map=tools/importmap.json --allow-read --allow-net=cdn.jsdelivr.net tools/test_catalog.js`
- Headless smoke hooks: `window.__museum` (`goHall`, `goRoom(id)` for any hall id, `door(wall)` to step through, `plan()`, `view(yaw,pitch,x,z)`, `pos()`, `interact(i)`).
