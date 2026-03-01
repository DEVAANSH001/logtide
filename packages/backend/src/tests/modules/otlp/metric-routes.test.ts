import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { gzipSync } from 'zlib';
import { build } from '../../../server.js';
import { createTestApiKey } from '../../helpers/index.js';

describe('OTLP Metrics API', () => {
  let app: any;
  let apiKey: string;
  let projectId: string;

  beforeEach(async () => {
    if (!app) {
      app = await build();
      await app.ready();
    }

    const testKey = await createTestApiKey({ name: 'Test OTLP Metrics Key' });
    apiKey = testKey.plainKey;
    projectId = testKey.project_id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ==========================================================================
  // POST /v1/otlp/metrics - OTLP Metrics Ingestion
  // ==========================================================================
  describe('POST /v1/otlp/metrics', () => {
    it('should ingest a basic gauge metric via JSON', async () => {
      const otlpRequest = {
        resourceMetrics: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'test-service' } }],
          },
          scopeMetrics: [{
            metrics: [{
              name: 'cpu.usage',
              gauge: {
                dataPoints: [{
                  timeUnixNano: String(Date.now() * 1000000),
                  asDouble: 0.75,
                  attributes: [{ key: 'host', value: { stringValue: 'server-1' } }],
                }],
              },
            }],
          }],
        }],
      };

      const response = await request(app.server)
        .post('/v1/otlp/metrics')
        .set('x-api-key', apiKey)
        .set('Content-Type', 'application/json')
        .send(otlpRequest)
        .expect(200);

      expect(response.body).toHaveProperty('partialSuccess');
      expect(response.body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(response.body.partialSuccess.errorMessage).toBe('');
    });

    it('should ingest a sum metric (counter)', async () => {
      const otlpRequest = {
        resourceMetrics: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'counter-service' } }],
          },
          scopeMetrics: [{
            metrics: [{
              name: 'http.requests.total',
              sum: {
                dataPoints: [{
                  timeUnixNano: String(Date.now() * 1000000),
                  asInt: '42',
                  attributes: [{ key: 'method', value: { stringValue: 'GET' } }],
                }],
                aggregationTemporality: 2, // CUMULATIVE
                isMonotonic: true,
              },
            }],
          }],
        }],
      };

      const response = await request(app.server)
        .post('/v1/otlp/metrics')
        .set('x-api-key', apiKey)
        .set('Content-Type', 'application/json')
        .send(otlpRequest)
        .expect(200);

      expect(response.body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(response.body.partialSuccess.errorMessage).toBe('');
    });

    it('should ingest a histogram metric with bucketCounts and explicitBounds', async () => {
      const otlpRequest = {
        resourceMetrics: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'histogram-service' } }],
          },
          scopeMetrics: [{
            metrics: [{
              name: 'http.request.duration',
              histogram: {
                dataPoints: [{
                  timeUnixNano: String(Date.now() * 1000000),
                  count: '100',
                  sum: 5432.1,
                  min: 1.2,
                  max: 890.5,
                  bucketCounts: ['10', '25', '30', '20', '10', '5'],
                  explicitBounds: [10, 50, 100, 250, 500],
                  attributes: [{ key: 'endpoint', value: { stringValue: '/api/users' } }],
                }],
                aggregationTemporality: 2,
              },
            }],
          }],
        }],
      };

      const response = await request(app.server)
        .post('/v1/otlp/metrics')
        .set('x-api-key', apiKey)
        .set('Content-Type', 'application/json')
        .send(otlpRequest)
        .expect(200);

      expect(response.body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(response.body.partialSuccess.errorMessage).toBe('');
    });

    it('should ingest a summary metric with quantileValues', async () => {
      const otlpRequest = {
        resourceMetrics: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'summary-service' } }],
          },
          scopeMetrics: [{
            metrics: [{
              name: 'rpc.server.duration',
              summary: {
                dataPoints: [{
                  timeUnixNano: String(Date.now() * 1000000),
                  count: '200',
                  sum: 15000.0,
                  quantileValues: [
                    { quantile: 0.5, value: 50.0 },
                    { quantile: 0.9, value: 120.0 },
                    { quantile: 0.99, value: 450.0 },
                  ],
                }],
              },
            }],
          }],
        }],
      };

      const response = await request(app.server)
        .post('/v1/otlp/metrics')
        .set('x-api-key', apiKey)
        .set('Content-Type', 'application/json')
        .send(otlpRequest)
        .expect(200);

      expect(response.body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(response.body.partialSuccess.errorMessage).toBe('');
    });

    it('should handle multiple resources with different service names', async () => {
      const otlpRequest = {
        resourceMetrics: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'frontend' } }],
            },
            scopeMetrics: [{
              metrics: [{
                name: 'page.load.time',
                gauge: {
                  dataPoints: [{
                    timeUnixNano: String(Date.now() * 1000000),
                    asDouble: 2.5,
                  }],
                },
              }],
            }],
          },
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'backend' } }],
            },
            scopeMetrics: [{
              metrics: [{
                name: 'db.query.time',
                gauge: {
                  dataPoints: [{
                    timeUnixNano: String(Date.now() * 1000000),
                    asDouble: 15.3,
                  }],
                },
              }],
            }],
          },
        ],
      };

      const response = await request(app.server)
        .post('/v1/otlp/metrics')
        .set('x-api-key', apiKey)
        .set('Content-Type', 'application/json')
        .send(otlpRequest)
        .expect(200);

      expect(response.body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(response.body.partialSuccess.errorMessage).toBe('');
    });

    it('should handle multiple metrics in a single request', async () => {
      const otlpRequest = {
        resourceMetrics: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'multi-metric-svc' } }],
          },
          scopeMetrics: [{
            metrics: [
              {
                name: 'system.cpu.usage',
                gauge: {
                  dataPoints: [{
                    timeUnixNano: String(Date.now() * 1000000),
                    asDouble: 0.65,
                  }],
                },
              },
              {
                name: 'system.memory.usage',
                gauge: {
                  dataPoints: [{
                    timeUnixNano: String(Date.now() * 1000000),
                    asDouble: 0.82,
                  }],
                },
              },
              {
                name: 'http.server.requests',
                sum: {
                  dataPoints: [{
                    timeUnixNano: String(Date.now() * 1000000),
                    asInt: '1500',
                  }],
                  aggregationTemporality: 2,
                  isMonotonic: true,
                },
              },
            ],
          }],
        }],
      };

      const response = await request(app.server)
        .post('/v1/otlp/metrics')
        .set('x-api-key', apiKey)
        .set('Content-Type', 'application/json')
        .send(otlpRequest)
        .expect(200);

      expect(response.body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(response.body.partialSuccess.errorMessage).toBe('');
    });

    it('should handle snake_case field names (Python SDK)', async () => {
      const otlpRequest = {
        resource_metrics: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'python-svc' } }],
          },
          scope_metrics: [{
            metrics: [{
              name: 'http.duration',
              gauge: {
                data_points: [{
                  time_unix_nano: String(Date.now() * 1000000),
                  as_double: 123.4,
                }],
              },
            }],
          }],
        }],
      };

      const response = await request(app.server)
        .post('/v1/otlp/metrics')
        .set('x-api-key', apiKey)
        .set('Content-Type', 'application/json')
        .send(otlpRequest)
        .expect(200);

      expect(response.body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(response.body.partialSuccess.errorMessage).toBe('');
    });

    it('should handle empty request body (valid per OTLP spec)', async () => {
      const response = await request(app.server)
        .post('/v1/otlp/metrics')
        .set('x-api-key', apiKey)
        .set('Content-Type', 'application/json')
        .send({ resourceMetrics: [] })
        .expect(200);

      expect(response.body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(response.body.partialSuccess.errorMessage).toBe('');
    });

    it('should handle gzip-compressed JSON (Content-Encoding: gzip)', async () => {
      const otlpRequest = {
        resourceMetrics: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'gzip-json-metrics' } }],
          },
          scopeMetrics: [{
            metrics: [{
              name: 'gzip.test.gauge',
              gauge: {
                dataPoints: [{
                  timeUnixNano: String(Date.now() * 1000000),
                  asDouble: 99.9,
                }],
              },
            }],
          }],
        }],
      };

      const jsonData = JSON.stringify(otlpRequest);
      const gzippedData = gzipSync(Buffer.from(jsonData));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/otlp/metrics',
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
          'x-api-key': apiKey,
        },
        payload: gzippedData,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(body.partialSuccess.errorMessage).toBe('');
    });

    it('should auto-detect gzip by magic bytes (no Content-Encoding header)', async () => {
      const otlpRequest = {
        resourceMetrics: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'gzip-magic-metrics' } }],
          },
          scopeMetrics: [{
            metrics: [{
              name: 'magic.bytes.gauge',
              gauge: {
                dataPoints: [{
                  timeUnixNano: String(Date.now() * 1000000),
                  asDouble: 42.0,
                }],
              },
            }],
          }],
        }],
      };

      const jsonData = JSON.stringify(otlpRequest);
      const gzippedData = gzipSync(Buffer.from(jsonData));

      // Send gzip data WITHOUT Content-Encoding header
      // The server should detect gzip by magic bytes (0x1f 0x8b)
      const response = await app.inject({
        method: 'POST',
        url: '/v1/otlp/metrics',
        headers: {
          'content-type': 'application/x-protobuf',
          // NOTE: No 'content-encoding' header!
          'x-api-key': apiKey,
        },
        payload: gzippedData,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(body.partialSuccess.errorMessage).toBe('');
    });

    it('should handle JSON sent with protobuf content-type (fallback)', async () => {
      const otlpRequest = {
        resourceMetrics: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'proto-fallback-svc' } }],
          },
          scopeMetrics: [{
            metrics: [{
              name: 'fallback.gauge',
              gauge: {
                dataPoints: [{
                  timeUnixNano: String(Date.now() * 1000000),
                  asDouble: 77.7,
                }],
              },
            }],
          }],
        }],
      };

      const jsonData = JSON.stringify(otlpRequest);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/otlp/metrics',
        headers: {
          'content-type': 'application/x-protobuf',
          'x-api-key': apiKey,
        },
        payload: Buffer.from(jsonData),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(body.partialSuccess.errorMessage).toBe('');
    });

    it('should handle gzip-compressed protobuf content-type (JSON inside)', async () => {
      const otlpRequest = {
        resourceMetrics: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'gzip-proto-json' } }],
          },
          scopeMetrics: [{
            metrics: [{
              name: 'gzip.proto.gauge',
              gauge: {
                dataPoints: [{
                  timeUnixNano: String(Date.now() * 1000000),
                  asDouble: 55.5,
                }],
              },
            }],
          }],
        }],
      };

      const jsonData = JSON.stringify(otlpRequest);
      const gzippedData = gzipSync(Buffer.from(jsonData));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/otlp/metrics',
        headers: {
          'content-type': 'application/x-protobuf',
          'content-encoding': 'gzip',
          'x-api-key': apiKey,
        },
        payload: gzippedData,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(body.partialSuccess.errorMessage).toBe('');
    });

    it('should reject request without API key', async () => {
      const response = await request(app.server)
        .post('/v1/otlp/metrics')
        .set('Content-Type', 'application/json')
        .send({ resourceMetrics: [] })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Unauthorized');
    });

    it('should reject request with invalid API key', async () => {
      const response = await request(app.server)
        .post('/v1/otlp/metrics')
        .set('x-api-key', 'invalid_key_12345')
        .set('Content-Type', 'application/json')
        .send({ resourceMetrics: [] })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Unauthorized');
    });

    it('should handle malformed JSON', async () => {
      await request(app.server)
        .post('/v1/otlp/metrics')
        .set('x-api-key', apiKey)
        .set('Content-Type', 'application/json')
        .send('invalid json{')
        .expect(400);
    });

    it('should ingest gauge metric with exemplars', async () => {
      const otlpRequest = {
        resourceMetrics: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'exemplar-test' } }],
          },
          scopeMetrics: [{
            metrics: [{
              name: 'request.duration',
              gauge: {
                dataPoints: [{
                  timeUnixNano: String(Date.now() * 1000000),
                  asDouble: 150.5,
                  exemplars: [{
                    timeUnixNano: String(Date.now() * 1000000),
                    asDouble: 200.1,
                    traceId: 'abc123def456abc123def456abc123de',
                    spanId: '1234567890abcdef',
                    filteredAttributes: [{ key: 'http.method', value: { stringValue: 'GET' } }],
                  }],
                }],
              },
            }],
          }],
        }],
      };

      const response = await request(app.server)
        .post('/v1/otlp/metrics')
        .set('x-api-key', apiKey)
        .set('Content-Type', 'application/json')
        .send(otlpRequest)
        .expect(200);

      expect(response.body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(response.body.partialSuccess.errorMessage).toBe('');
    });

    it('should return 200 with empty records (no data points in gauge)', async () => {
      const otlpRequest = {
        resourceMetrics: [{
          resource: { attributes: [] },
          scopeMetrics: [{
            metrics: [{ name: 'empty.metric', gauge: { dataPoints: [] } }],
          }],
        }],
      };

      const response = await request(app.server)
        .post('/v1/otlp/metrics')
        .set('x-api-key', apiKey)
        .set('Content-Type', 'application/json')
        .send(otlpRequest)
        .expect(200);

      expect(response.body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(response.body.partialSuccess.errorMessage).toBe('');
    });
  });

  // ==========================================================================
  // GET /v1/otlp/metrics - Health Check
  // ==========================================================================
  describe('GET /v1/otlp/metrics', () => {
    it('should return ok status (health check)', async () => {
      const response = await request(app.server)
        .get('/v1/otlp/metrics')
        .set('x-api-key', apiKey)
        .expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
