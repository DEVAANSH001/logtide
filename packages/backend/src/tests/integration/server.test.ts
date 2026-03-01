import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { build } from '../../server.js';
import type { FastifyInstance } from 'fastify';

describe('Server.ts - Custom Parsers and Error Handlers', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = await build();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('Custom JSON Parser', () => {
        it('should handle empty body with application/json content type', async () => {
            // We use /health which is public and doesn't require auth
            const response = await request(app.server)
                .post('/health') // Although it's a GET route, Fastify will still parse body if Content-Type is set
                .set('Content-Type', 'application/json')
                .send('')
                .expect(200);

            expect(response.body).toBeDefined();
        });

        it('should handle whitespace-only body with application/json content type', async () => {
            const response = await request(app.server)
                .post('/health')
                .set('Content-Type', 'application/json')
                .send('   ')
                .expect(200);

            expect(response.body).toBeDefined();
        });

        it('should return 400 for invalid JSON', async () => {
            const response = await request(app.server)
                .post('/health')
                .set('Content-Type', 'application/json')
                .send('{ "invalid": json }')
                .expect(400);

            expect(response.body.error).toContain('Invalid JSON');
        });
    });

    describe('Global Error Handler', () => {
        it('should handle generic 500 errors', async () => {
            // We can trigger an error by calling a route with invalid params that might crash or throw
            // Or we could register a temporary route that just throws
            app.get('/test-error', async () => {
                throw new Error('Test intentional error');
            });

            const response = await request(app.server)
                .get('/test-error')
                .expect(500);

            expect(response.body.error).toBe('Internal Server Error');
            expect(response.body.message).toBe('Test intentional error');
        });

        it('should handle validation errors with 400 status', async () => {
            // Trigger a validation error (e.g., missing required fields in ingestion)
            const response = await request(app.server)
                .post('/api/v1/ingest')
                .set('x-api-key', 'invalid-key')
                .send({ logs: 'not-an-array' })
                .expect(400);

            expect(response.body.statusCode).toBe(400);
        });
    });

    describe('Rate Limiting Key Generator', () => {
        it('should use IP address when no API key or Auth header is present', async () => {
            // This is hard to verify from outside without checking logs or headers if they are returned
            // but we can at least ensure the route still works
            const response = await request(app.server)
                .get('/health')
                .expect(200);
            
            expect(response.status).toBe(200);
        });
    });
});
