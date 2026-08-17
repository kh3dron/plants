# Plants

Working through [The Algorithmic Beauty of Plants](https://algorithmicbotany.org/papers/abop/abop.pdf) (ABOP), plus a growing wing of adjacent emergent algorithms.

Live: [kh3dron.github.io/plants](https://kh3dron.github.io/plants/)

## 1.0 Museum

`index.html` + `museum/` — a walkable first-person 3D gallery. three.js 0.160 via CDN import map, ES modules, no build step.

Controls: `WASD` move · `E` enter room / act · `F` focus an exhibit · `M` room directory · `P` photo mode · `T` guided tour · `Backspace` exit room.

Focus mode gives sliders and a grammar editor per exhibit; the copy-link button encodes the full edited grammar in the URL.

### 1.1 Wings

| Wing | Content | Source |
|---|---|---|
| Fractal Curves | ABOP ch. 1 edge-rewriting curves, framed | `specimens.js` |
| Bracketed Axial Trees | ABOP fig. 1.24 plants a–f | `specimens.js` |
| Three-Dimensional Trees | Honda / Aono–Kunii parametric models | `specimens.js` |
| Racemes | ABOP ch. 3 inflorescences with organs | `specimens.js` |
| Phyllotaxis | Vogel spirals, pinecone cylinder | `specimens.js` |
| Compound Leaves | pinnate / bipinnate / palmate | `specimens.js` |
| Iterated Function Systems | chaos-game point clouds | `specimens.js` |
| Development | staged growth animations | `specimens.js` |
| Cellular Layers | map-L-system-spirit tissue mosaics | `specimens.js` |
| Cellular Automata | Wolfram rules 30/90/110 panels; Game of Life time towers (R-pentomino, acorn, Gosper gun) — generation = vertical layer | `specimens.js` |
| Evolution Greenhouse | interactive selective breeding of bracketed grammars | `genetics.js`, breeder room in `world.js` |

### 1.2 Evolution Greenhouse

Dawkins-biomorph selection over L-system genomes (axiom, rules, iterations, angle). One parent pedestal, eight mutant offspring, a wild-seed pedestal to restart from an ABOP founder. `E` on an offspring makes it the next parent. Mutation operators: branch insert / prune / duplicate, turn flip, segment insert, angle jitter, iteration depth. Offspring are validated against an expansion budget before display. Lineage persists in `localStorage`; the hall hero updates to the current parent.

### 1.3 Pollinators

`pollinators.js` — instanced boid moths (separation / alignment / cohesion, weak attraction to exhibits, soft wall springs) drift through every location.

## 2.0 Classic 2D pages

`chapters/` — standalone per-chapter demos, indexed at `chapters.html`. `programs.md` tracks book coverage.

## 3.0 Dev

- Serve statically: `python3 -m http.server` (or `make build && make run` for Docker).
- Headless regression test (builds all 66 catalog specimens plus 30 bred generations, no WebGL needed):
  `deno run --import-map=tools/importmap.json --allow-read --allow-net=cdn.jsdelivr.net tools/test_catalog.js`
- Headless smoke hooks: `window.__museum` (`goHall`, `goRoom(id)`, `view(yaw,pitch,x,z)`, `pos()`, `interact(i)`).
