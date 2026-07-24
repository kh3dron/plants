// L-system engines: deterministic/stochastic string rewriting, plus a
// parametric variant used by the 3D tree models. No dependencies.

// Small reproducible PRNG so a given "seed" always grows the same plant.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Context-free string L-system.
// rules: { symbol: "replacement" }  or  { symbol: [{replacement, probability}] }
export class LSystem {
  constructor(axiom, rules, rng = Math.random) {
    this.axiom = axiom;
    this.rng = rng;
    this.rules = {};
    for (const key of Object.keys(rules)) {
      const val = rules[key];
      this.rules[key] = Array.isArray(val)
        ? val
        : [{ replacement: val, probability: 1 }];
    }
  }

  pick(options) {
    if (options.length === 1) return options[0].replacement;
    const r = this.rng();
    let acc = 0;
    for (const o of options) {
      acc += o.probability;
      if (r <= acc) return o.replacement;
    }
    return options[options.length - 1].replacement;
  }

  generate(iterations) {
    let s = this.axiom;
    for (let i = 0; i < iterations; i++) {
      let out = "";
      for (const c of s) out += this.rules[c] ? this.pick(this.rules[c]) : c;
      s = out;
    }
    return s;
  }
}

// Turn a plain command string into the token stream the turtle consumes.
export function tokenizePlain(str) {
  const tokens = [];
  for (const c of str) tokens.push({ cmd: c, param: null });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parametric L-system (for Honda-style 3D trees).
// Modules look like  A(l,w)  F(1)  !(w)  +(45)  and productions carry
// arithmetic expressions over the formal parameters plus global constants.
// ---------------------------------------------------------------------------

function evalExpr(expr, scope) {
  const keys = Object.keys(scope);
  const vals = keys.map((k) => scope[k]);
  // eslint-disable-next-line no-new-func
  return Function(...keys, `"use strict"; return (${expr});`)(...vals);
}

function applyParametricRules(str, rules, params) {
  let result = str;
  for (const rule of rules) {
    const built = buildPredicateRegex(rule.predecessor);
    result = result.replace(built.regex, (...args) => {
      const scope = { ...params };
      built.formals.forEach((name, i) => {
        scope[name] = parseFloat(args[i + 1]);
      });
      return substituteSuccessor(rule.successor, scope);
    });
  }
  return result;
}

function buildPredicateRegex(pred) {
  // pred like "A(l,w)" or "F(1)" or "!(w)"
  const m = pred.match(/^([A-Za-z!&+\-/\\|^])(?:\(([^)]*)\))?$/);
  if (!m) {
    return { regex: new RegExp(pred.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), formals: [] };
  }
  const symbol = m[1];
  const formalsRaw = m[2];
  const escSym = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (formalsRaw === undefined) {
    return { regex: new RegExp(escSym, "g"), formals: [] };
  }
  const formals = formalsRaw.split(",").map((s) => s.trim());
  const cap = formals.map(() => "([\\d.eE+\\-]+)").join(",");
  return { regex: new RegExp(escSym + "\\(" + cap + "\\)", "g"), formals };
}

function substituteSuccessor(successor, scope) {
  // Replace expressions inside parentheses with evaluated numbers.
  return successor.replace(/\(([^()]*)\)/g, (whole, inner) => {
    const parts = inner.split(",").map((p) => {
      const t = p.trim();
      if (t === "") return t;
      try {
        const v = evalExpr(t, scope);
        return typeof v === "number" && isFinite(v) ? +v.toFixed(5) : t;
      } catch {
        return t;
      }
    });
    return "(" + parts.join(",") + ")";
  });
}

export function expandParametric(axiom, rules, params, iterations) {
  let str = axiom;
  for (let i = 0; i < iterations; i++) str = applyParametricRules(str, rules, params);
  return str;
}

// Tokenize a parametric string into { cmd, param } where param is a number.
export function tokenizeParametric(str) {
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    const c = str[i];
    if (/[A-Za-z!&+\-/\\|^[\]]/.test(c)) {
      let param = null;
      if (str[i + 1] === "(") {
        let j = i + 2;
        let depth = 1;
        while (j < str.length && depth > 0) {
          if (str[j] === "(") depth++;
          else if (str[j] === ")") depth--;
          j++;
        }
        const raw = str.slice(i + 2, j - 1);
        const first = raw.split(",")[0];
        param = parseFloat(first);
        if (isNaN(param)) param = null;
        i = j - 1;
      }
      tokens.push({ cmd: c, param });
    }
    i++;
  }
  return tokens;
}
