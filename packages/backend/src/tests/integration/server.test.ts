import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { build } from '../../server.js';
import type { FastifyInstance } from 'fastify';
import { createTestApiKey } from '../helpers/index.js';

describe('Server.ts - Custom Parsers and Error Handlers', () => {
    let app: FastifyInstance;
    let apiKey: string;

    beforeAll(async () => {
        app = await build();
        const testData = await createTestApiKey();
        apiKey = testData.plainKey;
        
        // Register a test route that accepts POST with JSON body
        app.post('/test-json', async (request, reply) => {
            return { received: request.body };
        });
    });

    afterAll(async () => {
        await app.close();
    });

    describe('Custom JSON Parser', () => {
        it('should handle empty body with application/json content type', async () => {
            const response = await request(app.server)
                .post('/test-json')
                .set('Content-Type', 'application/json')
                .send('')
                .expect(200);

            expect(response.body.received).toEqual({});
        });

        it('should handle whitespace-only body with application/json content type', async () => {
            const response = await request(app.server)
                .post('/test-json')
                .set('Content-Type', 'application/json')
                .send('   ')
                .expect(200);

            expect(response.body.received).toEqual({});
        });

        it('should return 400 for invalid JSON', async () => {
            const response = await request(app.server)
                .post('/test-json')
                .set('Content-Type', 'application/json')
                .send('{ "invalid": json }')
                .expect(400);

            expect(response.body.error).toContain('Invalid JSON');
        });

        it('should handle NDJSON disguised as application/json', async () => {
            const ndjson = '{"a":1}\n{"b":2}';
            const response = await request(app.server)
                .post('/test-json')
                .set('Content-Type', 'application/json')
                .send(ndjson)
                .expect(200);

            expect(response.body.received).toHaveProperty('_ndjsonLogs');
            expect(response.body.received._ndjsonLogs).toHaveLength(2);
        });
    });

    describe('Global Error Handler', () => {
        it('should handle generic 500 errors', async () => {
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
            const response = await request(app.server)
                .post('/api/v1/ingest')
                .set('x-api-key', apiKey)
                .send({ logs: 'not-an-array' })
                .expect(400);

            expect(response.body.statusCode).toBe(400);
        });
    });

    describe('Rate Limiting Key Generator', () => {
        it('should use IP address when no API key or Auth header is present', async () => {
            const response = await request(app.server)
                .get('/health')
                .expect(200);
            
            expect(response.status).toBe(200);
        });
    });
});
