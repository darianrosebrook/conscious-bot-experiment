/**
 * Infrastructure Health Check Tests
 *
 * Verifies that required infrastructure services (PostgreSQL + pgvector, Ollama)
 * are running and accessible before running memory system tests.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Pool } from 'pg';

const POSTGRES_AVAILABLE = process.env.POSTGRES_AVAILABLE === 'true';
const OLLAMA_AVAILABLE = process.env.OLLAMA_AVAILABLE === 'true';

describe.skipIf(!POSTGRES_AVAILABLE && !OLLAMA_AVAILABLE)('Infrastructure Health Checks', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      user: process.env.POSTGRES_USER || 'conscious_bot',
      password: process.env.POSTGRES_PASSWORD || 'secure_password',
      database: process.env.POSTGRES_DB || 'conscious_bot',
    });
  });

  it.skipIf(!POSTGRES_AVAILABLE)('PostgreSQL is accessible', async () => {
    const result = await pool.query('SELECT version()');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].version).toContain('PostgreSQL');
  });

  it.skipIf(!POSTGRES_AVAILABLE)('pgvector extension is installed', async () => {
    const result = await pool.query(
      "SELECT * FROM pg_extension WHERE extname = 'vector'"
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].extname).toBe('vector');
  });

  it.skipIf(!POSTGRES_AVAILABLE)('can create and query vector columns', async () => {
    await pool.query('DROP TABLE IF EXISTS test_vectors');
    await pool.query(`
      CREATE TABLE test_vectors (
        id SERIAL PRIMARY KEY,
        embedding vector(768)
      )
    `);

    const testEmbedding = new Array(768).fill(0.1);
    await pool.query('INSERT INTO test_vectors (embedding) VALUES ($1)', [
      `[${testEmbedding.join(',')}]`,
    ]);

    const result = await pool.query('SELECT * FROM test_vectors');
    expect(result.rows).toHaveLength(1);

    await pool.query('DROP TABLE test_vectors');
  });

  it.skipIf(!OLLAMA_AVAILABLE)('Ollama service is accessible', async () => {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:5002';
    const response = await fetch(`${ollamaHost}/api/tags`);
    expect(response.ok).toBe(true);

    const data = (await response.json()) as { models: any[] };
    expect(data).toHaveProperty('models');
    expect(Array.isArray(data.models)).toBe(true);
  });

  it.skipIf(!OLLAMA_AVAILABLE)('embeddinggemma model is available', async () => {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:5002';
    const response = await fetch(`${ollamaHost}/api/tags`);
    const data = (await response.json()) as { models: any[] };

    const embeddingModel = data.models.find((m: any) =>
      m.name.includes('embeddinggemma')
    );
    expect(embeddingModel).toBeDefined();
  });

  it.skipIf(!OLLAMA_AVAILABLE)('gemma3n:e2b generation model is available', async () => {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:5002';
    const response = await fetch(`${ollamaHost}/api/tags`);
    const data = (await response.json()) as { models: any[] };

    const generationModel = data.models.find((m: any) =>
      m.name.includes('gemma3n:e2b')
    );
    expect(generationModel).toBeDefined();
  });

  it.skipIf(!OLLAMA_AVAILABLE)('can generate embeddings via MLX sidecar', async () => {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:5002';
    const response = await fetch(`${ollamaHost}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma',
        prompt: 'test embedding generation',
      }),
    });

    expect(response.ok).toBe(true);
    const data = (await response.json()) as { embedding: number[] };
    expect(data).toHaveProperty('embedding');
    expect(Array.isArray(data.embedding)).toBe(true);
    expect(data.embedding.length).toBeGreaterThan(0);
  }, 30000); // Allow 30s for first embedding generation
});
