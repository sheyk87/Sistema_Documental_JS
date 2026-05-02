// tests/security/a02-cryptographic-failures.test.js
// OWASP A02: Cryptographic Failures Tests
const { app, request, generateUserToken, JWT_SECRET } = require('./testHelper');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

describe('OWASP A02 - Cryptographic Failures', () => {
    test('1. JWT_SECRET has sufficient length (>= 32 characters)', () => {
        expect(JWT_SECRET).toBeDefined();
        expect(JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    });

    test('2. JWT tokens include issuer claim', () => {
        const token = generateUserToken();
        const decoded = jwt.decode(token, { complete: true });
        expect(decoded.payload.iss).toBe('gde-system');
    });

    test('3. JWT tokens include audience claim', () => {
        const token = generateUserToken();
        const decoded = jwt.decode(token, { complete: true });
        expect(decoded.payload.aud).toBe('gde-api');
    });

    test('4. JWT tokens have expiration', () => {
        const token = generateUserToken();
        const decoded = jwt.decode(token, { complete: true });
        expect(decoded.payload.exp).toBeDefined();
        expect(decoded.payload.exp).toBeGreaterThan(Date.now() / 1000);
    });

    test('5. .env is listed in .gitignore', () => {
        const gitignorePath = path.join(__dirname, '../../../.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const content = fs.readFileSync(gitignorePath, 'utf8');
            expect(content).toContain('.env');
        }
    });

    test('6. STORAGE_ENCRYPTION_KEY is configured (no fallback)', () => {
        expect(process.env.STORAGE_ENCRYPTION_KEY).toBeDefined();
        expect(process.env.STORAGE_ENCRYPTION_KEY.length).toBeGreaterThanOrEqual(32);
    });

    test('7. FILE_SECRET is configured', () => {
        expect(process.env.FILE_SECRET).toBeDefined();
        // 32 bytes en hexadecimal = 64 caracteres
        expect(process.env.FILE_SECRET.length).toBe(64);
    });
});
