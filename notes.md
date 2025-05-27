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
