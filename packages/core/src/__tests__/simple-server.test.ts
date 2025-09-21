/**
 * Simple Server Test
 *
 * Tests that the test server can start and respond to requests
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import supertest from 'supertest';

describe('Simple Test Server', () => {
  let app: express.Application;
  let server: any;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        system: 'test-server',
        timestamp: Date.now(),
        version: '1.0.0',
      });
    });

    app.post('/health', (req, res) => {
      res.json({
        status: 'healthy',
        system: 'test-server',
        timestamp: Date.now(),
        version: '1.0.0',
        received: req.body,
      });
    });

    app.get('/test', (req, res) => {
      res.json({
        message: 'Test endpoint working!',
        timestamp: Date.now(),
      });
    });

    server = app.listen(0); // Use random available port
  });

  afterAll((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  it('should respond to health check', async () => {
    const response = await supertest(app).get('/health').expect(200);

    expect(response.body.status).toBe('healthy');
    expect(response.body.system).toBe('test-server');
    expect(response.body.version).toBe('1.0.0');
    expect(response.body).toHaveProperty('timestamp');
  });

  it('should respond to test endpoint', async () => {
    const response = await supertest(app).get('/test').expect(200);

    expect(response.body.message).toBe('Test endpoint working!');
    expect(response.body).toHaveProperty('timestamp');
  });

  it('should handle JSON requests', async () => {
    const testData = { test: 'data' };
    const response = await supertest(app)
      .post('/health')
      .send(testData)
      .expect(200);

    expect(response.body.status).toBe('healthy');
    expect(response.body.received).toEqual(testData);
  });
});
