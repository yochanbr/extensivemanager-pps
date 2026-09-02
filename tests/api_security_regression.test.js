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

describe('Production Security, Authorization & Regression Test Suite', () => {
    let adminCookie = '';
    let adminXsrfToken = '';
    let testEmpId = null;

    beforeAll(async () => {
        const res = await request(app)
            .post('/login')
            .send({
                username: process.env.ADMIN_USER || 'admin',
                password: process.env.ADMIN_PASS || 'admin12nammamart'
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

    // 1. Security Headers
    it('should include production security headers on all responses', async () => {
        const res = await request(app).get('/api/health');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBe('DENY');
        expect(res.headers['x-xss-protection']).toBe('1; mode=block');
    });

    // 2. CSRF Protection
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

    it('should reject state-mutating requests with forged CSRF tokens with 403', async () => {
        const res = await request(app)
            .post('/api/employees')
            .set('Cookie', adminCookie)
            .set('x-xsrf-token', 'forged_fake_token_12345')
            .send({
                username: 'csrf_test_user',
                password: 'password123',
                name: 'CSRF User'
            });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    // 3. Data Isolation / PII Protection
    it('should strip sensitive PII (Aadhaar, PAN, Bank, Phone) when unauthenticated caller fetches /api/employees', async () => {
        const res = await request(app).get('/api/employees');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);

        if (res.body.length > 0) {
            const sample = res.body[0];
            expect(sample.password).toBeUndefined();
            expect(sample['aadhar-number']).toBeUndefined();
            expect(sample['pan-number']).toBeUndefined();
            expect(sample['account-number']).toBeUndefined();
            expect(sample.phone).toBeUndefined();
            expect(sample.email).toBeUndefined();
            expect(sample.address).toBeUndefined();
        }
    });

    it('should decrypt and serve full employee details when verified admin requests /api/employees', async () => {
        const res = await request(app)
            .get('/api/employees')
            .set('Cookie', adminCookie);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        if (res.body.length > 0) {
            const sample = res.body[0];
            expect(sample.password).toBeUndefined(); // Passwords must never be exposed
            expect(sample).toHaveProperty('name');
            testEmpId = sample.id;
        }
    });

    // 4. Authentication Failures & Input Validation
    it('should return 400 when logging in with missing credentials', async () => {
        const res = await request(app)
            .post('/login')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('should return 401 when logging in with invalid credentials', async () => {
        const res = await request(app)
            .post('/login')
            .send({
                username: 'invalid_user_9999',
                password: 'wrong_password'
            });

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    // 5. Protected Route Access Control
    it('should return 401 JSON for unauthorized API calls rather than 302 HTML redirect', async () => {
        const res = await request(app)
            .get('/api/attendance/logs')
            .set('Accept', 'application/json');

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it('should return 401 or 403 JSON for unauthorized employee mutation', async () => {
        const res = await request(app)
            .delete('/api/employees/fake_id_1234')
            .set('Accept', 'application/json');

        expect([401, 403]).toContain(res.status);
        expect(res.body.success).toBe(false);
    });

    // 6. Diagnostics & System Health
    it('should return status online from health check without database dependencies', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('online');
    });
});
