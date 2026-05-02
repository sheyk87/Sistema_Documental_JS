// tests/security/a08-integrity-failures.test.js
// OWASP A08: Software and Data Integrity Failures Tests
const { app, request, generateAdminToken } = require('./testHelper');
const fs = require('fs');
const path = require('path');

describe('OWASP A08 - Software and Data Integrity Failures', () => {
    const adminToken = generateAdminToken();

    test('1. Settings API only accepts whitelisted keys', async () => {
        const originalJwtSecret = process.env.JWT_SECRET;
        
        const res = await request(app)
            .put('/api/system/settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ JWT_SECRET: 'HACKED', DB_PASSWORD: 'STOLEN' });
        
        // JWT_SECRET should NOT have been modified
        expect(process.env.JWT_SECRET).toBe(originalJwtSecret);
        // DB_PASSWORD should NOT have been modified by settings API
        expect(process.env.DB_PASSWORD).not.toBe('STOLEN');
    });

    test('2. Frontend HTML uses SRI on CDN scripts', () => {
        const htmlPath = path.join(__dirname, '../../../gde_frontend/index.html');
        const html = fs.readFileSync(htmlPath, 'utf8');
        // Check that at least some scripts have integrity attribute
        const scriptTags = html.match(/<script[^>]+src="https:\/\/cdnjs[^"]*"[^>]*>/g) || [];
        const withIntegrity = scriptTags.filter(tag => tag.includes('integrity='));
        expect(withIntegrity.length).toBeGreaterThan(0);
    });

    test('3. Frontend HTML uses crossorigin attribute on CDN scripts', () => {
        const htmlPath = path.join(__dirname, '../../../gde_frontend/index.html');
        const html = fs.readFileSync(htmlPath, 'utf8');
        const scriptTags = html.match(/<script[^>]+src="https:\/\/cdnjs[^"]*"[^>]*>/g) || [];
        const withCrossorigin = scriptTags.filter(tag => tag.includes('crossorigin='));
        expect(withCrossorigin.length).toBeGreaterThan(0);
    });

    test('4. Multer upload has file size limits', () => {
        const docRoutesPath = path.join(__dirname, '../../routes/docRoutes.js');
        const content = fs.readFileSync(docRoutesPath, 'utf8');
        expect(content).toContain('fileSize');
        expect(content).toContain('10 * 1024 * 1024');
    });

    test('5. Multer upload has file type filter', () => {
        const docRoutesPath = path.join(__dirname, '../../routes/docRoutes.js');
        const content = fs.readFileSync(docRoutesPath, 'utf8');
        expect(content).toContain('fileFilter');
        expect(content).toContain('ALLOWED_MIME_TYPES');
    });
});
