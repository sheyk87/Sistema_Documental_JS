// tests/security/a07-auth-failures.test.js
// OWASP A07: Identification and Authentication Failures Tests
const { app, request, generateExpiredToken, generateInvalidToken, generateUserToken } = require('./testHelper');

describe('OWASP A07 - Identification and Authentication Failures', () => {

    test('1. Login without credentials returns 400', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({});
        expect(res.status).toBe(400);
    });

    test('2. Login with non-existent email returns generic message (no user enumeration)', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nonexistent@test.com', password: 'SomePass123' });
        expect(res.status).toBe(401);
        // Should NOT say "user not found" - generic message
        expect(res.body.message).not.toMatch(/no encontrado/i);
        expect(res.body.message).toMatch(/inválid/i);
    });

    test('3. Login with wrong password returns same generic message', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@gde.com', password: 'WrongPassword123' });
        // Should return same status as non-existent user
        expect(res.status).toBe(401);
        expect(res.body.message).toMatch(/inválid/i);
    });

    test('4. Expired token is rejected with 401', async () => {
        const expiredToken = generateExpiredToken();
        const res = await request(app)
            .get('/api/docs/all')
            .set('Authorization', `Bearer ${expiredToken}`);
        expect(res.status).toBe(401);
    });

    test('5. Invalid (tampered) token is rejected', async () => {
        const invalidToken = generateInvalidToken();
        const res = await request(app)
            .get('/api/docs/all')
            .set('Authorization', `Bearer ${invalidToken}`);
        expect(res.status).toBe(401);
    });

    test('6. Forgot-password with non-existent email returns generic response', async () => {
        const res = await request(app)
            .post('/api/auth/forgot-password')
            .send({ email: 'doesnotexist@nowhere.com' });
        // Should return 200 with generic message (anti user-enumeration)
        expect(res.status).toBe(200);
        expect(res.body.message).not.toMatch(/no encontrado/i);
    });

    test('7. Login response NEVER contains password field', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@gde.com', password: '123' });
        // Even if login succeeds or fails, response should never have password
        if (res.body.user) {
            expect(res.body.user.password).toBeUndefined();
            expect(res.body.user.two_factor_secret).toBeUndefined();
        }
    });

    test('8. Request without Authorization header returns 401', async () => {
        const res = await request(app).get('/api/users/me');
        expect(res.status).toBe(401);
    });
});
