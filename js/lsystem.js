class LSystem {
    constructor(axiom, rules) {
        this.axiom = axiom;
        this.rules = this.parseRules(rules);
    }

    parseRules(rulesString) {
        const rules = {};
        const rulePairs = rulesString.split('\n').filter(rule => rule.trim());
        
        rulePairs.forEach(rule => {
            const [key, value] = rule.split('=').map(s => s.trim());
            rules[key] = value;
        });
        
        return rules;
    }

    generate(iterations) {
        let result = this.axiom;
        
        for (let i = 0; i < iterations; i++) {
            let newResult = '';
            for (let char of result) {
                newResult += this.rules[char] || char;
            }
            result = newResult;
        }
        
        return result;
    }
} 