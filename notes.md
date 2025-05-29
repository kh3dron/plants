# The Algorithmic Beauty of Plants

## 1: Graphical Modeling using L Systems

- Lindenmeyer systems: a parallel re-writing system and a type of formal grammar
  - Formal grammars: a Set of rules that defines a language
    - rules are applied sequentially
  - "rewriting systems" ie fractals
    - requiring 2 forms: the "shape" and the "generator", which mutate the original shape
      - see: snowflake curve
  - L systems were an early method for understanding plant topology, since these parallel mutations fit cell life well
- DOL systems: L systems which are deterministic and context-free
  - the single beginning cell / string is called the `axiom`
  - Turtle graphics
  - generatign fractals with transformations to turtle graphics rules
  - FASS curves: space Filing, self Avoiding, Simple and self Similar
  - Edge replacement v. Node replacement
    - Edge replacement: need to keep track of sides of the edge (for self avoidance)
    - Node replacement: need to keep track of direction in and out of the node
      - hilbert curves are node replacing
- Branching structures: plants expand, unlike current L-systems. 
    - Axial trees: purely topological objects
    - Tree-OL systems: L systems that grow branches
    - Bracketes OL systems: one kind of syntax for representing this branching, with stacks
- Stochastic L-systems
    - How do you introduce randomless? add some uncertainty to the branching.
    - Note that just changing lengths and sizes produces trees which look different, but are topologically identical
- Context sensitive L-systems
    - you may not want all these trees to be completely stateless
    - todo dig into this, not sure I get how it works
- Growth
    - Since we're making plants, we might want them to grow as well as develop new segments
    - contexts can encode exponential, sigmoidal, sqrt growth, and others
- Parametric L-systems, 2L-systems

## 2: Modeling of Trees

- Past theories: voxels & cellular automata
    - quite weak in many ways; fails to avoid self collisions for example
- theories for tree topology:
    - made obervations about branching ratios, angles
    - modeled the rules after obervations of real plants
    - some disagreement as to where randomness belongs in this process
- many nice pictures of trees in this chapter
- replicating the shapes of real trees is very hard. there's been better luck with smaller plants, it seems

## 3: Developmental models of herbaceous plants

- We need to add some more features to our models to get more realistic plants: 
    - temoprality: not all parts of plants are the same age, young branches may follow different rules than older ones
    - watching plants grow over time to track this
- note that herbaceous means non-woody
    - woody plants are harder to model; their development depends more on environmental factors
- 3 levels of granularity:
    - Partial L-systems: nondeterministic
        - see pg. 65 for example plant
    - L-system schemata: makes an individual plant non-deterministic, like a seed (literally)
        - you could: assign functions to probabilities
        - switch L-systems based on external factors (mimicking seasons, for example)
        - delays, IE parametrics
        - accumulations, IE grow 10 leaves before flowering (observed in nature!)
        - signals - appearing from somewhere in the tree and terminating elsewhere
    - Complete L-systems: even more information
- Branching patterns
    - subapical growth: new branches are created exclusively by apices. All herbaceous plants behave like this
- Monopoidal inflorescences
    - some plants produce one flower at the end of a branch
    - others begin producing flowers and then continue producing flowers along that branch (see: lily of the valley, pg.72)
        -this has the effect of growing flowers in a clear age gradient, very nice
- many different combinations of terminations & continuations in examples here
- Umbels: multiple internodes attached to a single node

## 4: Phyllotaxis

- regular arrangement of lateral organs, think sunflowers

