// tests/security/a03-injection.test.js
// OWASP A03: Injection Tests
const { app, request, generateUserToken, generateAdminToken } = require('./testHelper');

describe('OWASP A03 - Injection', () => {
    const userToken = generateUserToken();
    const adminToken = generateAdminToken();

    test('1. SQL injection in login email field returns error, not data leak', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: "' OR '1'='1' --", password: 'anything' });
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.body).not.toHaveProperty('token');
    });

    test('2. SQL injection in login with UNION attack fails', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: "admin@gde.com' UNION SELECT * FROM users--", password: 'test' });
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.body).not.toHaveProperty('token');
    });

    test('3. Path traversal in file download is blocked', async () => {
        const res = await request(app)
            .get('/api/docs/download/..%5C..%5C.env')
            .set('Authorization', `Bearer ${userToken}`);
        // Should be rejected - either 400 from validator or 404 from Express normalizing
        expect([400, 404]).toContain(res.status);
        // The key check: response should NOT contain actual .env file contents
        const body = JSON.stringify(res.body);
        expect(body).not.toContain('JWT_SECRET');
        expect(body).not.toContain('DB_PASSWORD');
    });

    test('4. Path traversal with encoded chars in download is blocked', async () => {
        const res = await request(app)
            .get('/api/docs/download/..%2F..%2F.env')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(400);
    });

    test('5. Path traversal in file delete is blocked', async () => {
        const res = await request(app)
            .delete('/api/docs/test-id/attach/..%5C..%5Cserver.js')
            .set('Authorization', `Bearer ${userToken}`);
        // Should be rejected - either 400 from validator or 404 from Express normalizing
        expect([400, 404]).toContain(res.status);
        // Verify server.js still exists (wasn't deleted)
        const fs = require('fs');
        const path = require('path');
        expect(fs.existsSync(path.join(__dirname, '../../server.js'))).toBe(true);
    });

    test('6. Settings update rejects non-whitelisted keys', async () => {
        const res = await request(app)
            .put('/api/system/settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ JWT_SECRET: 'hacked_secret', MALICIOUS_KEY: 'evil_value' });
        // Should succeed (200) but not apply the non-whitelisted keys
        if (res.status === 200) {
            expect(process.env.JWT_SECRET).not.toBe('hacked_secret');
            expect(process.env.MALICIOUS_KEY).toBeUndefined();
        }
    });

    test('7. XSS payload in login email is sanitized/rejected', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: '<script>alert("xss")</script>', password: 'test' });
        expect(res.status).toBeGreaterThanOrEqual(400);
        // Response should NOT contain unescaped script tags
        const body = JSON.stringify(res.body);
        expect(body).not.toContain('<script>');
    });
});
