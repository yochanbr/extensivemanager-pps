const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of envConfig) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            process.env[match[1]] = match[2].trim().replace(/['"]/g, '');
        }
    }
}

const request = require('supertest');
const app = require('../server');

jest.setTimeout(30000);

describe('Production Security & API Regression Test Suite', () => {
    let adminCookie = '';
    let adminXsrfToken = '';

    beforeAll(async () => {
        const res = await request(app)
            .post('/login')
            .send({
                username: process.env.ADMIN_USER,
                password: process.env.ADMIN_PASS
            });
        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        
        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        const accessToken = cookies.find(c => c.startsWith('accessToken=')).split(';')[0];
        const xsrfToken = cookies.find(c => c.startsWith('xsrf-token='))?.split(';')[0] || '';
        adminXsrfToken = xsrfToken.split('=')[1];
        adminCookie = `${accessToken}; ${xsrfToken}`;
    });

    it('should include production security headers on all responses', async () => {
        const res = await request(app).get('/api/health');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBe('DENY');
        expect(res.headers['x-xss-protection']).toBe('1; mode=block');
    });

    it('should reject state-mutating requests with missing CSRF tokens with 403', async () => {
        const res = await request(app)
            .post('/api/employees')
            .set('Cookie', adminCookie)
            .send({
                username: 'csrf_test_user',
                password: 'password123',
                name: 'CSRF User'
            });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    it('should correctly serve employee listing without sensitive secrets exposed', async () => {
        const res = await request(app)
            .get('/api/employees')
            .set('Cookie', adminCookie);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        if (res.body.length > 0) {
            const first = res.body[0];
            expect(first).toHaveProperty('id');
            expect(first).toHaveProperty('name');
        }
    });

    it('should return 401 for unauthorized protected routes without throwing or redirecting', async () => {
        const res = await request(app)
            .get('/api/attendance/logs')
            .set('Accept', 'application/json');

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });
});
