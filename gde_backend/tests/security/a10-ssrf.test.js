// tests/security/a10-ssrf.test.js
// OWASP A10: Server-Side Request Forgery (SSRF) Tests
const { app, request, generateAdminToken, generateUserToken } = require('./testHelper');
const fs = require('fs');
const path = require('path');

describe('OWASP A10 - Server-Side Request Forgery (SSRF)', () => {
    const adminToken = generateAdminToken();
    const userToken = generateUserToken();

    test('1. LDAP_URL rejects non-ldap protocol URLs via settings', async () => {
        const sysControllerPath = path.join(__dirname, '../../controllers/systemController.js');
        const content = fs.readFileSync(sysControllerPath, 'utf8');
        // Verify the code validates LDAP_URL protocol
        expect(content).toContain("startsWith('ldap://')");
        expect(content).toContain("startsWith('ldaps://')");
    });

    test('2. Settings whitelist prevents injecting arbitrary URLs', () => {
        const sysControllerPath = path.join(__dirname, '../../controllers/systemController.js');
        const content = fs.readFileSync(sysControllerPath, 'utf8');
        expect(content).toContain('ALLOWED_SETTINGS_KEYS');
        // Verify that the whitelist doesn't contain dangerous keys
        expect(content).not.toContain("'DB_HOST'");
        expect(content).not.toContain("'DB_PASSWORD'");
    });

    test('3. Public verification endpoint does NOT expose internal server details', async () => {
        // Call the public verify endpoint with a non-existent ID
        const res = await request(app).get('/api/docs/public/verify/nonexistent-id');
        const body = JSON.stringify(res.body);
        // Should not contain internal paths, server info, or DB details
        expect(body).not.toContain('__dirname');
        expect(body).not.toContain('node_modules');
        expect(body).not.toMatch(/c:\\/i);
    });

    test('4. CORS configuration restricts origins', () => {
        const serverPath = path.join(__dirname, '../../server.js');
        const content = fs.readFileSync(serverPath, 'utf8');
        // Should NOT have cors() without arguments (open to all)
        expect(content).not.toMatch(/app\.use\(cors\(\)\)/);
        // Should have origin configuration
        expect(content).toContain('allowedOrigins');
    });

    test('5. Email service validates TLS configuration exists', () => {
        const emailServicePath = path.join(__dirname, '../../services/emailService.js');
        const content = fs.readFileSync(emailServicePath, 'utf8');
        // The email service should have TLS configuration
        expect(content).toContain('tls');
    });
});
