const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');

// 1. Manually load environment variables BEFORE requiring server.js
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

jest.setTimeout(30000); // 30 seconds to allow firebase to initialize

describe('Step 1: Employee Creation Flow', () => {
    let adminCookie = '';
    let adminXsrfToken = '';
    const testUsername = `testuser_${Date.now()}`;
    const testPassword = 'TestPassword123!';
    let createdEmployeeId = null;

    beforeAll(async () => {
        // Log in as Admin to get the session cookie
        const res = await request(app)
            .post('/login')
            .send({
                username: process.env.ADMIN_USER,
                password: process.env.ADMIN_PASS
            });
        
        if (res.status !== 200 || !res.body.success) {
            console.error('Login Failed!', res.status, res.body);
        }

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        
        // Extract both access and refresh tokens
        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        const accessToken = cookies.find(c => c.startsWith('accessToken=')).split(';')[0];
        const xsrfToken = cookies.find(c => c.startsWith('xsrf-token='))?.split(';')[0] || '';
        adminXsrfToken = xsrfToken.split('=')[1];
        adminCookie = `${accessToken}; ${xsrfToken}`;
    });

    it('should fail to create an employee without admin privileges', async () => {
        const res = await request(app)
            .post('/api/employees')
            .send({
                username: testUsername,
                password: testPassword,
                name: 'Test Employee'
            });
        
        // Should be rejected because no admin cookie is provided
        expect(res.status).toBe(403); 
    });

    it('should create an employee successfully', async () => {
        const payload = {
            username: testUsername,
            password: testPassword,
            name: 'Test Employee',
            designation: 'Tester',
            type: 'Full Time',
            salary: '50000',
            weekOff: 'Sunday',
            startTime: '09:00',
            endTime: '17:00'
        };

        const res = await request(app)
            .post('/api/employees')
            .set('Cookie', adminCookie)
            .set('x-xsrf-token', adminXsrfToken)
            .send(payload);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        createdEmployeeId = testUsername; // Based on backend logic, username might be used as ID or it generates one. Let's assume it succeeds.
    });

    it('should fail when creating an employee with missing mandatory fields', async () => {
        const res = await request(app)
            .post('/api/employees')
            .set('Cookie', adminCookie)
            .set('x-xsrf-token', adminXsrfToken)
            .send({
                name: 'Incomplete Employee'
            });

        expect(res.status).not.toBe(200);
        expect(res.body.success).toBe(false);
    });

    it('should fetch the created employee in the list', async () => {
        const res = await request(app)
            .get('/api/employees')
            .set('Cookie', adminCookie);

        expect(res.status).toBe(200);
        expect(res.body).toBeInstanceOf(Array);
        
        const found = res.body.find(emp => emp.username === testUsername);
        expect(found).toBeDefined();
        expect(found.name).toBe('Test Employee');
    });

});
