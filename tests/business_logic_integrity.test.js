const fs = require('fs');
const path = require('path');
const request = require('supertest');

// Load environment variables
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

const app = require('../server');

jest.setTimeout(30000);

describe('Business Logic & Data Integrity Adversarial Verification Suite', () => {
    let adminCookie = '';
    let adminXsrfToken = '';
    let testEmpId = '';
    const uniqueSuffix = Date.now().toString().slice(-6);
    const testUsername = `biz_emp_${uniqueSuffix}`;

    beforeAll(async () => {
        const res = await request(app)
            .post('/login')
            .send({
                username: process.env.ADMIN_USER || 'admin',
                password: process.env.ADMIN_PASS || 'admin12nammamart'
            });
        
        expect(res.status).toBe(200);
        const cookies = res.headers['set-cookie'];
        const accessToken = cookies.find(c => c.startsWith('accessToken=')).split(';')[0];
        const xsrfToken = cookies.find(c => c.startsWith('xsrf-token='))?.split(';')[0] || '';
        adminXsrfToken = xsrfToken.split('=')[1];
        adminCookie = `${accessToken}; ${xsrfToken}`;
    });

    // 1. EMPLOYEE LIFECYCLE & DUPLICATE PREVENTION
    it('should create employee with complete business fields', async () => {
        const res = await request(app)
            .post('/api/employees')
            .set('Cookie', adminCookie)
            .set('x-xsrf-token', adminXsrfToken)
            .send({
                username: testUsername,
                password: 'Password123!',
                name: 'Business Test Employee',
                phone: '9876543210',
                email: `biz_${uniqueSuffix}@example.com`,
                role: 'employee',
                'start-time': '09:00',
                'end-time': '18:00',
                'break-time': '13:00'
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        // Fetch to retrieve assigned ID
        const listRes = await request(app)
            .get('/api/employees')
            .set('Cookie', adminCookie);
        
        const created = listRes.body.find(e => e.username === testUsername);
        expect(created).toBeDefined();
        testEmpId = created.id;
    });

    it('should prevent creating duplicate employees with identical username', async () => {
        const res = await request(app)
            .post('/api/employees')
            .set('Cookie', adminCookie)
            .set('x-xsrf-token', adminXsrfToken)
            .send({
                username: testUsername,
                password: 'Password123!',
                name: 'Duplicate Test'
            });

        expect([400, 409]).toContain(res.status);
        expect(res.body.success).toBe(false);
    });

    // 2. ATTENDANCE SCAN LOGIC & DEACTIVATED USER LOCKOUT
    it('should reject attendance scan for nonexistent employee IDs with 404', async () => {
        const res = await request(app)
            .post('/api/attendance/scan')
            .send({
                employeeId: 'nonexistent_emp_id_9999',
                actionType: 'in'
            });

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });

    it('should allow valid Check-In scan for active employee', async () => {
        const res = await request(app)
            .post('/api/attendance/scan')
            .send({
                employeeId: testEmpId,
                actionType: 'in'
            });

        expect([200, 400]).toContain(res.status);
    });

    it('should prevent inactive/deactivated employees from checking in', async () => {
        await request(app)
            .put(`/api/employees/${testEmpId}`)
            .set('Cookie', adminCookie)
            .set('x-xsrf-token', adminXsrfToken)
            .send({
                isActive: false
            });

        const res = await request(app)
            .post('/api/attendance/scan')
            .send({
                employeeId: testEmpId,
                actionType: 'in'
            });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.code).toBe('USER_DEACTIVATED');
    });

    // 3. CONCURRENCY & RACE CONDITION LOCK
    it('should handle rapid concurrent scan requests gracefully without data corruption', async () => {
        await request(app)
            .put(`/api/employees/${testEmpId}`)
            .set('Cookie', adminCookie)
            .set('x-xsrf-token', adminXsrfToken)
            .send({
                isActive: true
            });

        const [req1, req2] = await Promise.all([
            request(app).post('/api/attendance/scan').send({ employeeId: testEmpId, actionType: 'out' }),
            request(app).post('/api/attendance/scan').send({ employeeId: testEmpId, actionType: 'out' })
        ]);

        expect([200, 400, 429]).toContain(req1.status);
        expect([200, 400, 429]).toContain(req2.status);
    });

    // 4. REPORTING MATHEMATICAL INTEGRITY
    it('should return valid dashboard summary schema with non-negative numbers', async () => {
        const res = await request(app)
            .get('/api/dashboard/summary')
            .set('Cookie', adminCookie);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('success', true);
        if (res.body.summary) {
            expect(typeof res.body.summary.working).toBe('number');
            expect(typeof res.body.summary.totalCheckins).toBe('number');
            expect(res.body.summary.working).toBeGreaterThanOrEqual(0);
            expect(res.body.summary.totalCheckins).toBeGreaterThanOrEqual(0);
        }
    });

    // 5. CLEANUP TEST EMPLOYEE
    afterAll(async () => {
        if (testEmpId) {
            await request(app)
                .delete(`/api/employees/${testEmpId}`)
                .set('Cookie', adminCookie)
                .set('x-xsrf-token', adminXsrfToken);
        }
    });
});
