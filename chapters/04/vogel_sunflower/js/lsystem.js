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
            grouped[symbol].push({
                replacement: rule.replacement,
                probability: rule.probability
            });
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
                            newResult += this.selectReplacement(this.rules[char]);
                            currentPos++;
                        } else {
                            // Extract the full parameterized symbol
                            const fullSymbol = result.substring(currentPos, endPos + 1);
                            const { symbol, params } = this.parseParameters(fullSymbol);
                            
                            if (this.rules[symbol]) {
                                const replacement = this.selectReplacement(this.rules[symbol]);
                                // Replace parameters in the replacement string
                                let processedReplacement = this.evaluateParameter(replacement, params);
                                newResult += processedReplacement;
                            } else {
                                newResult += fullSymbol;
                            }
                            currentPos = endPos + 1;
                        }
                    } else {
                        // Regular symbol without parameters
                        newResult += this.selectReplacement(this.rules[char]);
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