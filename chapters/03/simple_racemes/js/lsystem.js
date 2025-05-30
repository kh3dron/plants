class LSystem {
    constructor(axiom, rules, rng) {
        this.axiom = axiom;
        // rules: array of {symbol, replacement, probability}
        this.rules = this.groupRulesBySymbol(rules);
        this.rng = rng || Math.random;
    }

    // Group rules by symbol for easy lookup
    groupRulesBySymbol(rulesArray) {
        if (!Array.isArray(rulesArray)) {
            throw new TypeError("rules must be an array");
        }
        const grouped = {};
        rulesArray.forEach(rule => {
            if (!grouped[rule.symbol]) grouped[rule.symbol] = [];
            grouped[rule.symbol].push({
                replacement: rule.replacement,
                probability: rule.probability
            });
        });
        return grouped;
    }

    // Select a replacement based on probabilities
    selectReplacement(rulesForSymbol) {
        const r = this.rng();
        let acc = 0;
        for (let rule of rulesForSymbol) {
            acc += rule.probability;
            if (r <= acc) return rule.replacement;
        }
        // fallback: last rule
        return rulesForSymbol[rulesForSymbol.length - 1].replacement;
    }

    generate(iterations) {
        let result = this.axiom;
        for (let i = 0; i < iterations; i++) {
            let newResult = '';
            for (let char of result) {
                if (this.rules[char]) {
                    newResult += this.selectReplacement(this.rules[char]);
                } else {
                    newResult += char;
                }
            }
            result = newResult;
        }
        return result;
    }
} 