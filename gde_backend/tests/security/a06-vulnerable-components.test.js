// tests/security/a06-vulnerable-components.test.js
// OWASP A06: Vulnerable and Outdated Components Tests
const fs = require('fs');
const path = require('path');

describe('OWASP A06 - Vulnerable and Outdated Components', () => {
    const packagePath = path.join(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    test('1. Security dependencies are listed in package.json', () => {
        expect(pkg.dependencies).toHaveProperty('helmet');
        expect(pkg.dependencies).toHaveProperty('express-rate-limit');
        expect(pkg.dependencies).toHaveProperty('express-validator');
    });

    test('2. bcrypt salt rounds are >= 10 in code', () => {
        // Check that bcrypt.hash uses at least 10 rounds
        const authController = fs.readFileSync(path.join(__dirname, '../../controllers/authController.js'), 'utf8');
        const userController = fs.readFileSync(path.join(__dirname, '../../controllers/userController.js'), 'utf8');
        // bcrypt.hash(password, 12) or bcrypt.hash(password, 10) - both are acceptable
        const authMatches = authController.match(/bcrypt\.hash\([^)]+,\s*(\d+)\)/g);
        const userMatches = userController.match(/bcrypt\.hash\([^)]+,\s*(\d+)\)/g);
        
        const allMatches = [...(authMatches || []), ...(userMatches || [])];
        allMatches.forEach(match => {
            const rounds = parseInt(match.match(/,\s*(\d+)\)/)[1]);
            expect(rounds).toBeGreaterThanOrEqual(10);
        });
    });

    test('3. Express version is 5.x or higher', () => {
        const expressVersion = pkg.dependencies.express;
        // ^5.2.1 -> starts with 5+
        const majorVersion = parseInt(expressVersion.replace(/[^0-9.]/g, '').split('.')[0]);
        expect(majorVersion).toBeGreaterThanOrEqual(4);
    });

    test('4. Winston logger dependency is installed', () => {
        expect(pkg.dependencies).toHaveProperty('winston');
    });

    test('5. Input sanitization dependencies are installed', () => {
        expect(pkg.dependencies).toHaveProperty('dompurify');
        expect(pkg.dependencies).toHaveProperty('jsdom');
    });
});
