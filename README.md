# Plants

Working through [The Algorithmic Beauty of Plants](https://algorithmicbotany.org/papers/abop/abop.pdf) (ABOP), plus a growing wing of adjacent emergent algorithms.

Live: [kh3dron.github.io/plants](https://kh3dron.github.io/plants/)

## 1 Catalog

`index.html` + `museum/gallery.js`: a flat, paged specimen catalog. three.js 0.160 via CDN import map, ES modules, no build step.

- One page per hall, routed by URL hash (`#fractals`). Left nav lists all halls; the last item is the info page (`#info`).
- Each exhibit is a plate rendered from its specimen. Live simulations (particle life, reaction-diffusion, Lenia, growth stages) keep running on the plate. 3D specimens rotate on a turntable, on the plate and on the detail page until dragged; flat works stay front-on.
- A plate links to the exhibit detail page (`#fractals/1`): orbit view, parameter sliders, grammar editor, PNG/GLB/STL export (STL is hand-written binary; point clouds are refused). `Copy link` encodes the edited state as `#exhibit=<json>`.
- Evolution Greenhouse, Hall of Generations, and Seed Vault are button-driven pages. State persists in `localStorage`.
- Hall order and grouping: `GROUPS` in `museum/gallery.js`. Specimen data: `museum/specimens.js`.
- Design: industrial (grotesk face, mono for grammar strings, moss second ink, white stock); specimen plates render on an ink ground.

## 2 Walkable 3D museum (parked)

STATUS: parked 11-09-2026. Not linked from the catalog except on the info page. Unmaintained until resumed.

`museum.html` + `museum/main.js`, `world.js`, `plan.js`, `focus.js`, `pollinators.js`, `floorplan.yaml`: a first-person walkable museum over the same specimen catalog. Adds js-yaml 4.1.

Controls: `WASD` move · walk into a doorway to change halls · `E` act · `F` focus an exhibit · `M` hall directory · `P` photo mode · `T` guided tour · `Backspace` return to the atrium. A click or movement key requests pointer lock; `Esc` frees the cursor.

### 2.1 Floor plan DSL

The building is data: `museum/floorplan.yaml` declares a graph of rectangular halls connected by doors. `plan.js` loads and validates it; `world.js` builds one hall at a time. Nothing is positioned by hand and there is no procedural placement (no rings, no random scatter) — layout inside a hall is a pure function of the exhibit list order.

- HALL: `id`, plus either `family: <specimens.js id>` (shorthand: every variation, inherited title/subtitle/accent) or an ordered `exhibits:` list.
- EXHIBIT REFS: `fam` (hero) · `fam/*` (all variations) · `fam/3` (by index) · `fam/Koch Snowflake` (by name).
- DOORS: `doors: { north: other-hall }`, walls north/south/east/west, one door per wall. Declare on one side only; the return door is derived (opposite wall if free). Halls are separate scenes, so wall coordinates never collide between halls.
- KIND: `gallery` (default) | `greenhouse` | `generations` | `vault` — the three stateful special rooms.
- LAYOUT: a gallery's long axis follows its entry direction; exhibits fill pedestal pairs along the side walls in list order and the hall stretches to fit. Appending an exhibit = one line; inserting next to an existing one = one line at that position; a new hall = one block + one door line.
- VALIDATION: unknown families/variations, door conflicts, and halls unreachable from `entrance` are hard errors at load (shown on screen) and covered by the headless test.

## 3 Halls

- Fractal Curves: ABOP ch. 1 edge-rewriting curves (`specimens.js`)
- Bracketed Axial Trees: ABOP fig. 1.24 plants a–f (`specimens.js`)
- Three-Dimensional Trees: Honda / Aono–Kunii parametric models (`specimens.js`)
- Space Colonization: Runions attractor trees (open/dense/columnar/windswept), Honda comparison, leaf venation (`colonize.js`)
- Inflorescences: ABOP ch. 3 racemes with organs (`specimens.js`)
- Phyllotaxis: Vogel spirals, pinecone cylinder (`specimens.js`)
- Compound Leaves: pinnate / bipinnate / palmate (`specimens.js`)
- Plant Development: staged growth animations (`specimens.js`)
- Fractal Ferns: iterated function systems, chaos-game point clouds (`specimens.js`)
- Cellular Layers: map-L-system-spirit tissue mosaics (`specimens.js`)
- Cellular Automata: Wolfram rules 30/90/110; Game of Life time towers (R-pentomino, acorn, Gosper gun), generation = vertical layer; Abelian sandpile (`specimens.js`)
- Particle Life: 5 species, asymmetric attraction matrix, live (`particlelife.js`)
- Reaction–Diffusion: live Gray–Scott panels (mitosis/coral/solitons/maze/worms), GPU ping-pong (`reaction.js`)
- Diffusion-Limited Aggregation: coral, sea fan, dendrite, frost (`dla.js`)
- Lenia: continuous CA on GPU; 5 regimes selected by a CPU survival search (`lenia.js`)
- Evolution Greenhouse: interactive selective breeding of bracketed grammars (`genetics.js`)
- Hall of Generations: automatic evolution; 16 wild seeds, fitness = canopy − wood − lean, checkpoint champions (`evolve.js`)
- Seed Vault: lineages preserved from the Greenhouse (`vault.js`)

The turtle supports tropism (ABOP eq. 2.1): a signed `droop` bends every segment toward or away from gravity — exposed as a slider on the tree families and heritable in the greenhouse. Live exhibits run through a `userData.tick(dt, ctx)` hook driven by the render loop (`ctx.renderer` for GPU sims).

### 3.1 Evolution Greenhouse

Dawkins-biomorph selection over L-system genomes (axiom, rules, iterations, angle). One parent, eight mutant offspring, a wild-seed action to restart from an ABOP founder. Selecting an offspring makes it the next parent. Mutation operators: branch insert / prune / duplicate, turn flip, segment insert, angle jitter, iteration depth. Offspring are validated against an expansion budget before display. Lineage persists in `localStorage`.

## 4 Classic 2D pages

`chapters/` — standalone per-chapter demos, indexed at `chapters.html`. `programs.md` tracks book coverage.

## 5 Dev

- Serve statically: `python3 -m http.server` (or `make build && make run` for Docker).
- Headless regression test (builds every catalog specimen, ticks live sims 120 frames, breeds 30 generations, validates `floorplan.yaml`; no WebGL needed):
  `deno run --import-map=tools/importmap.json --allow-read --allow-net=cdn.jsdelivr.net tools/test_catalog.js`
- Catalog smoke hook: `window.__gallery` (`queue()`, `live()`, `bench()`).
- Parked museum smoke hooks: `window.__museum` (`goHall`, `goRoom(id)` for any hall id, `door(wall)` to step through, `plan()`, `view(yaw,pitch,x,z)`, `pos()`, `interact(i)`).
