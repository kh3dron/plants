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
            const symbol = rule.symbol.split('(')[0]; // Extract base symbol without parameters
            if (!grouped[symbol]) grouped[symbol] = [];
            // Keep all rule properties (replacement, probability, min, etc)
            grouped[symbol].push({ ...rule });
        });
        return grouped;
    }

    // Parse parameters from a symbol
    parseParameters(symbol) {
        const match = symbol.match(/([A-Za-z])\(([^)]+)\)/);
        if (match) {
            return {
                symbol: match[1],
                params: match[2].split(',').map(p => parseFloat(p.trim()))
            };
        }
        return { symbol, params: [] };
    }

    // Select a rule based on probabilities
    selectRule(rulesForSymbol) {
        const r = this.rng();
        let acc = 0;
        for (let rule of rulesForSymbol) {
            acc += rule.probability;
            if (r <= acc) return rule;
        }
        // fallback: last rule
        return rulesForSymbol[rulesForSymbol.length - 1];
    }

    // Evaluate a parameter expression
    evaluateParameter(expr, params) {
        // First replace ${n} with the actual parameter values
        let processed = expr.replace(/\$\{(\d+)\}/g, (match, index) => {
            const paramIndex = parseInt(index);
            if (paramIndex < params.length) {
                return params[paramIndex].toString();
            }
            return match;
        });

        // Then evaluate any mathematical expressions
        try {
            // Replace any mathematical expressions with their evaluated results
            processed = processed.replace(/(\d+(?:\.\d+)?)\s*([*+\-])\s*(\d+(?:\.\d+)?)/g, (match, a, op, b) => {
                const numA = parseFloat(a);
                const numB = parseFloat(b);
                switch (op) {
                    case '*': return (numA * numB).toString();
                    case '+': return (numA + numB).toString();
                    case '-': return (numA - numB).toString();
                    default: return match;
                }
            });
        } catch (e) {
            console.warn('Error evaluating expression:', e);
            return processed;
        }

        return processed;
    }

    generate(iterations) {
        let result = this.axiom;
        for (let i = 0; i < iterations; i++) {
            let newResult = '';
            let currentPos = 0;
            while (currentPos < result.length) {
                const char = result[currentPos];
                if (this.rules[char]) {
                    // Check if this is a parameterized symbol
                    if (currentPos + 1 < result.length && result[currentPos + 1] === '(') {
                        // Find the matching closing parenthesis
                        let endPos = result.indexOf(')', currentPos + 1);
                        if (endPos === -1) {
                            // No closing parenthesis found, treat as regular symbol
                            const rule = this.selectRule(this.rules[char]);
                            newResult += rule.replacement;
                            currentPos++;
                        } else {
                            // Extract the full parameterized symbol
                            const fullSymbol = result.substring(currentPos, endPos + 1);
                            const { symbol, params } = this.parseParameters(fullSymbol);
                            if (this.rules[symbol]) {
                                // Filter rules by min (if present)
                                let applicableRules = this.rules[symbol].filter(rule => {
                                    if (typeof rule.min === 'number') {
                                        return params.length > 0 && params[0] >= rule.min;
                                    }
                                    return true;
                                });
                                if (applicableRules.length === 0) {
                                    // No applicable rule, keep symbol as is
                                    newResult += fullSymbol;
                                } else {
                                    const rule = this.selectRule(applicableRules);
                                    // Replace ${n} and math in replacement string
                                    let processedReplacement = this.evaluateParameter(rule.replacement, params);
                                    // If the replacement contains c{${0}-1}, replace with c(n-1)
                                    processedReplacement = processedReplacement.replace(/([A-Za-z])\{\$\{(\d+)\}([+\-*/]\d+)?\}/g, (match, sym, idx, op) => {
                                        let val = params[parseInt(idx)];
                                        if (op) {
                                            // Evaluate the operation
                                            val = eval(val + op);
                                        }
                                        return sym + '(' + val + ')';
                                    });
                                    newResult += processedReplacement;
                                }
                            } else {
                                newResult += fullSymbol;
                            }
                            currentPos = endPos + 1;
                        }
                    } else {
                        // Regular symbol without parameters
                        const rule = this.selectRule(this.rules[char]);
                        newResult += rule.replacement;
                        currentPos++;
                    }
                } else {
                    newResult += char;
                    currentPos++;
                }
            }
            result = newResult;
        }
        return result;
    }
} 