// tests/security/a01-broken-access-control.test.js
// OWASP A01: Broken Access Control Tests
const { app, request, generateUserToken, generateAdminToken } = require('./testHelper');

describe('OWASP A01 - Broken Access Control', () => {
    const userToken = generateUserToken();
    const adminToken = generateAdminToken();

    test('1. Non-admin user CANNOT create users', async () => {
        const res = await request(app)
            .post('/api/users/create')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ id: 'u_test_new', name: 'Test', email: 'test@test.com', password: 'TestPass123', areaId: 'a1', role: 'user' });
        expect(res.status).toBe(403);
    });

    test('2. Non-admin user CANNOT delete users', async () => {
        const res = await request(app)
            .delete('/api/users/delete/u1')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(403);
    });

    test('3. Non-admin user CANNOT create areas', async () => {
        const res = await request(app)
            .post('/api/areas/create')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ id: 'a_test', name: 'Test Area' });
        expect(res.status).toBe(403);
    });

    test('4. Non-admin user CANNOT delete areas', async () => {
        const res = await request(app)
            .delete('/api/areas/delete/a1')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(403);
    });

    test('5. Non-admin user CANNOT access system settings', async () => {
        const res = await request(app)
            .get('/api/system/settings')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(403);
    });

    test('6. Non-admin user CANNOT modify system settings', async () => {
        const res = await request(app)
            .put('/api/system/settings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ EMAIL_ENABLED: 'true' });
        expect(res.status).toBe(403);
    });

    test('7. Unauthenticated request CANNOT access protected routes', async () => {
        const res = await request(app).get('/api/docs/all');
        expect(res.status).toBe(401);
    });

    test('8. Non-admin user CANNOT bulk import users', async () => {
        const res = await request(app)
            .post('/api/users/bulk')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ users: [{ name: 'Bulk', email: 'bulk@test.com', password: 'TestPass123', areaId: 'a1' }] });
        expect(res.status).toBe(403);
    });
});
