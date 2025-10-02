# Memory Enhancement System - Comprehensive Test Plan

## Overview

This test plan covers the hybrid knowledge graph + vector memory enhancement system for conscious-bot. Following CAWS Tier 2 requirements (≥50% mutation score, ≥80% branch coverage, mandatory contracts, E2E smoke tests).

## Test Strategy

### Risk Assessment
- **High Risk**: Graph traversal performance at scale, entity extraction accuracy
- **Medium Risk**: Hybrid search result fusion, memory synchronization
- **Low Risk**: Basic CRUD operations, configuration validation

### Testing Approach
- **Test-Driven Development**: Write tests before implementation
- **Property-Based Testing**: Use fast-check for invariant verification
- **Contract-First Testing**: Validate against OpenAPI/GraphQL schemas
- **Integration Testing**: Real PostgreSQL with pgvector extension
- **Performance Testing**: Load testing for search operations

## Test Matrix

### Unit Tests (80%+ branch coverage target)

#### 1. Entity Extraction Service (`packages/memory/src/entity-extraction-service.ts`)
```typescript
// Property-based tests for entity extraction invariants
describe("Entity Extraction Service", () => {
  it("extracts entities with confidence ≥ 0.7 [INV: confidence threshold]", () => {
    fc.assert(fc.property(memoryTextArb(), (text) => {
      const result = extractEntities(text);
      return result.entities.every(e => e.confidence >= 0.7);
    }));
  });

  it("maintains entity uniqueness within extraction [INV: no duplicates]", () => {
    fc.assert(fc.property(memoryTextArb(), (text) => {
      const result = extractEntities(text);
      const entityNames = result.entities.map(e => e.name);
      return new Set(entityNames).size === entityNames.length;
    }));
  });

  it("handles empty or malformed input gracefully", () => {
    expect(() => extractEntities("")).not.toThrow();
    expect(() => extractEntities("   ")).not.toThrow();
    expect(() => extractEntities("!@#$%^&*()")).not.toThrow();
  });
});
```

#### 2. Knowledge Graph Manager (`packages/memory/src/knowledge-graph-manager.ts`)
```typescript
// Property-based tests for graph consistency
describe("Knowledge Graph Manager", () => {
  it("maintains graph consistency after entity operations [INV: atomic updates]", () => {
    fc.assert(fc.property(entityArb(), relationshipArb(), async (entity, rel) => {
      const initialStats = await getGraphStats();
      await processExtractionResult({ entities: [entity], relationships: [rel] });

      const finalStats = await getGraphStats();
      expect(finalStats.entityCount).toBeGreaterThanOrEqual(initialStats.entityCount);
      expect(finalStats.relationshipCount).toBeGreaterThanOrEqual(initialStats.relationshipCount);
    }));
  });

  it("prevents circular relationships in deduplication", () => {
    const entity1 = { id: "1", name: "Entity A" };
    const entity2 = { id: "2", name: "Entity B" };

    // This should not create circular references
    expect(() => mergeEntities(entity1, entity2)).not.toThrow();
  });
});
```

#### 3. Hybrid Search Engine (`packages/memory/src/hybrid-search-service.ts`)
```typescript
// Property-based tests for search invariants
describe("Hybrid Search Engine", () => {
  it("returns results in descending relevance order [INV: ranking consistency]", () => {
    fc.assert(fc.property(searchQueryArb(), async (query) => {
      const results = await searchMemory(query);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i-1].score);
      }
      return true;
    }));
  });

  it("includes provenance for explainable results [INV: traceability]", () => {
    fc.assert(fc.property(searchQueryArb(), async (query) => {
      const results = await searchMemory({ ...query, includeExplanation: true });
      return results.every(r => r.explanation && r.explanation.reasoningSteps.length > 0);
    }));
  });

  it("maintains backward compatibility with vector-only search", async () => {
    const query = { text: "test query", options: { searchType: "vector" } };
    const results = await searchMemory(query);

    // Should still work without graph components
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });
});
```

### Integration Tests (Real PostgreSQL with Testcontainers)

#### 1. Knowledge Graph Persistence
```typescript
describe("Knowledge Graph Integration", () => {
  let pg: StartedPostgreSqlContainer;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer()
      .withDatabase("memory_test")
      .start();
    await migrate(pg);
  });

  afterAll(async () => {
    await pg.stop();
  });

  it("persists entities and relationships atomically [flow A2]", async () => {
    const extractionResult = {
      entities: [createTestEntity()],
      relationships: [createTestRelationship()]
    };

    await processExtractionResult(extractionResult);

    // Verify both entities and relationships are persisted
    const entityCount = await pg.query("SELECT COUNT(*) FROM memory_knowledge_graph_entities");
    const relCount = await pg.query("SELECT COUNT(*) FROM memory_entity_relationships");

    expect(parseInt(entityCount.rows[0].count)).toBeGreaterThan(0);
    expect(parseInt(relCount.rows[0].count)).toBeGreaterThan(0);
  });

  it("handles concurrent graph updates without corruption", async () => {
    const promises = Array(10).fill(null).map(() =>
      processExtractionResult(createRandomExtractionResult())
    );

    await Promise.all(promises);

    // Graph should remain consistent
    const stats = await getGraphStats();
    expect(stats.entityCount).toBeGreaterThan(0);
    expect(stats.relationshipCount).toBeGreaterThan(0);
  });
});
```

#### 2. Hybrid Search Performance
```typescript
describe("Hybrid Search Performance Integration", () => {
  beforeAll(async () => {
    // Seed test data
    await seedTestMemories(1000);
    await buildKnowledgeGraph();
  });

  it("meets P95 < 600ms latency for complex queries [PERF: api_p95_ms]", async () => {
    const latencies = [];

    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await searchMemory({
        query: "complex multi-hop reasoning query",
        options: { maxHops: 3, includeExplanation: true }
      });
      const latency = performance.now() - start;
      latencies.push(latency);
    }

    const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
    expect(p95).toBeLessThan(600); // P95 requirement
  });

  it("handles concurrent searches without degradation [PERF: concurrent_searches]", async () => {
    const concurrentRequests = 50;
    const promises = Array(concurrentRequests).fill(null).map(() =>
      searchMemory({ query: "concurrent search test" })
    );

    const start = performance.now();
    await Promise.all(promises);
    const totalTime = performance.now() - start;

    // Should handle 50 concurrent requests in reasonable time
    expect(totalTime).toBeLessThan(10000); // 10 seconds for 50 requests
  });
});
```

### Contract Tests (OpenAPI/GraphQL Validation)

#### 1. Memory Hybrid Search API Contract Tests
```typescript
import { Pact } from '@pact-foundation/pact';
import { MemorySearchClient } from '../clients/memory-search-client';

describe("Memory Hybrid Search API Contract", () => {
  let client: MemorySearchClient;

  beforeAll(async () => {
    // Start Pact mock server
    await provider.setup();
    client = new MemorySearchClient(provider.url);
  });

  afterAll(async () => {
    await provider.finalize();
  });

  it("conforms to /memory/search schema [contract]", async () => {
    // Define expected request/response
    await provider.addInteraction({
      state: "memory search with entities",
      uponReceiving: "a memory search request",
      withRequest: {
        method: "POST",
        path: "/memory/search",
        body: {
          query: "test query",
          options: {
            maxResults: 10,
            includeExplanation: true
          }
        }
      },
      willRespondWith: {
        status: 200,
        body: {
          searchId: "uuid",
          results: [
            {
              id: "memory-id",
              content: "memory content",
              score: 0.9,
              metadata: {
                memoryType: "episodic",
                timestamp: "2024-01-01T00:00:00Z"
              }
            }
          ],
          metadata: {
            totalResults: 1,
            searchTime: 100,
            searchType: "hybrid"
          }
        }
      }
    });

    const result = await client.searchMemory({
      query: "test query",
      options: { maxResults: 10, includeExplanation: true }
    });

    expect(result.searchId).toBeDefined();
    expect(result.results).toHaveLength(1);
    expect(result.results[0].score).toBe(0.9);
  });
});
```

#### 2. Memory Knowledge Graph GraphQL Contract Tests
```typescript
import { graphql, GraphQLSchema } from 'graphql';

describe("Memory Knowledge Graph GraphQL Contract", () => {
  let schema: GraphQLSchema;

  beforeAll(async () => {
    // Load GraphQL schema from file
    schema = await loadSchema('./contracts/memory-knowledge-graph-schema.graphql');
  });

  it("validates memoryEntity query against schema [contract]", async () => {
    const query = `
      query GetEntity($id: ID!) {
        memoryEntity(id: $id) {
          id
          name
          type
          confidence
          relationships {
            edges {
              node {
                type
                confidence
              }
            }
          }
        }
      }
    `;

    const result = await graphql(schema, query, null, null, { id: "test-entity-id" });

    expect(result.errors).toBeUndefined();
    expect(result.data).toBeDefined();
  });

  it("enforces required fields in mutations [contract]", async () => {
    const mutation = `
      mutation CreateEntity($input: CreateMemoryEntityInput!) {
        createMemoryEntity(input: $input) {
          id
          name
          type
        }
      }
    `;

    // Test with missing required field
    const invalidInput = { name: "Test Entity" }; // Missing type and confidence

    const result = await graphql(schema, mutation, null, null, {
      input: invalidInput
    });

    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toContain("required");
  });
});
```

### E2E Smoke Tests (Critical User Journeys)

#### 1. Memory Search with Explanation
```typescript
test("memory search with explanation provides transparent reasoning [A4]", async ({ page }) => {
  // Navigate to memory search interface
  await page.goto("/memory/search");

  // Perform search
  await page.getByRole("textbox", { name: /memory search/i }).fill("AI design patterns I worked on");
  await page.getByRole("button", { name: /search/i }).click();

  // Verify results appear
  await expect(page.getByRole("region", { name: /search results/i })).toBeVisible();

  // Request explanation for first result
  await page.getByRole("button", { name: /explain result/i }).first().click();

  // Verify explanation appears with reasoning steps
  await expect(page.getByRole("region", { name: /explanation/i })).toBeVisible();
  await expect(page.getByText(/entity relationship chain/i)).toBeVisible();
  await expect(page.getByText(/confidence score/i)).toBeVisible();
});
```

#### 2. Knowledge Graph Entity Linking
```typescript
test("knowledge graph links entities across memory types [A2]", async ({ page }) => {
  // Create episodic memory with entity
  await page.goto("/memory/create");
  await page.getByRole("textbox", { name: /memory content/i }).fill("Worked on neural network optimization project");
  await page.getByRole("button", { name: /save memory/i }).click();

  // Verify entity extraction and linking
  await page.goto("/knowledge-graph/entities");

  // Should see extracted entities
  await expect(page.getByText(/neural network/i)).toBeVisible();
  await expect(page.getByText(/optimization project/i)).toBeVisible();

  // Verify entity relationships
  await page.getByRole("button", { name: /view relationships/i }).click();
  await expect(page.getByText(/related to/i)).toBeVisible();
});
```

### Property-Based Testing with fast-check

#### 1. Search Invariants
```typescript
// Arbitrary generators for property-based testing
const searchQueryArb = () =>
  fc.record({
    text: fc.string({ minLength: 1, maxLength: 100 }),
    options: fc.record({
      maxResults: fc.integer({ min: 1, max: 100 }),
      maxHops: fc.integer({ min: 1, max: 3 }),
      minConfidence: fc.float({ min: 0, max: 1 }),
      includeExplanation: fc.boolean(),
      searchType: fc.constantFrom("vector", "graph", "hybrid")
    })
  });

const memoryTextArb = () =>
  fc.string({ minLength: 10, maxLength: 1000 });

const entityArb = () =>
  fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    type: fc.constantFrom("PERSON", "CONCEPT", "PROJECT", "TECHNOLOGY"),
    confidence: fc.float({ min: 0.7, max: 1.0 }),
    embedding: fc.array(fc.float({ min: -1, max: 1 }), { minLength: 768, maxLength: 768 })
  });

const relationshipArb = () =>
  fc.record({
    id: fc.uuid(),
    sourceEntityId: fc.uuid(),
    targetEntityId: fc.uuid(),
    type: fc.constantFrom("WORKS_ON", "RELATED_TO", "DEPENDS_ON"),
    confidence: fc.float({ min: 0.5, max: 1.0 }),
    strength: fc.float({ min: 0, max: 1 })
  });
```

#### 2. Graph Consistency Properties
```typescript
describe("Knowledge Graph Consistency Properties", () => {
  it("entity deduplication preserves highest confidence [PROP: deduplication]", () => {
    fc.assert(fc.property(
      fc.array(entityArb(), { minLength: 2, maxLength: 10 }),
      (entities) => {
        // Group by name for deduplication
        const byName = new Map<string, typeof entities[0][]>();
        entities.forEach(e => {
          if (!byName.has(e.name)) byName.set(e.name, []);
          byName.get(e.name)!.push(e);
        });

        // Deduplication should preserve highest confidence entity
        for (const [name, entityList] of byName) {
          if (entityList.length > 1) {
            const deduplicated = deduplicateEntities(entityList);
            const maxConfidence = Math.max(...entityList.map(e => e.confidence));
            expect(deduplicated.confidence).toBe(maxConfidence);
          }
        }
        return true;
      }
    ));
  });

  it("relationship strength calculation is deterministic [PROP: determinism]", () => {
    fc.assert(fc.property(
      fc.array(relationshipArb(), { minLength: 1, maxLength: 20 }),
      (relationships) => {
        // Same input should always produce same strength calculation
        const strength1 = calculateRelationshipStrength(relationships[0]);
        const strength2 = calculateRelationshipStrength(relationships[0]);
        return strength1 === strength2;
      }
    ));
  });
});
```

### Mutation Testing Strategy

#### Target Coverage (Tier 2): ≥50% mutation score
```typescript
// Stryker configuration for mutation testing
module.exports = {
  mutate: [
    "packages/memory/src/**/*.ts",
    "!packages/memory/src/**/*.test.ts",
    "!packages/memory/src/**/*.spec.ts"
  ],
  testRunner: "jest",
  reporters: ["html", "clear-text", "progress"],
  thresholds: {
    high: 80,
    low: 50,
    break: 50  // Fail build if below 50%
  },
  mutator: "typescript",
  transpilers: [],
  testFramework: "jest",
  coverageAnalysis: "off"
};
```

### Performance Testing Strategy

#### Load Testing with k6
```typescript
// k6 script for memory search performance testing
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p95<600'], // P95 < 600ms requirement
    http_req_failed: ['rate<0.1'],  // Error rate < 10%
  },
};

export default function () {
  const payload = JSON.stringify({
    query: "AI design patterns neural network optimization",
    options: {
      maxResults: 20,
      maxHops: 3,
      includeExplanation: true,
      searchType: "hybrid"
    }
  });

  const response = http.post(
    'http://localhost:3000/api/v1/memory/search',
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 600ms': (r) => r.timings.duration < 600,
    'has results': (r) => JSON.parse(r.body).results.length > 0,
  });

  sleep(1);
}
```

## Test Data Strategy

### Factories and Fixtures
```typescript
// Memory chunk factory for consistent test data
export const createTestMemoryChunk = (overrides = {}) => ({
  id: generateId(),
  content: "Test memory content about AI design patterns",
  memoryType: "episodic",
  timestamp: new Date(),
  confidence: 0.9,
  chunkId: generateId(),
  ...overrides
});

// Entity factory
export const createTestEntity = (overrides = {}) => ({
  id: generateId(),
  name: "Neural Network",
  type: "TECHNOLOGY",
  confidence: 0.85,
  aliases: ["NN", "neural net"],
  embedding: generateEmbedding(768),
  metadata: {
    memoryTypes: ["episodic", "semantic"],
    extractionMethods: ["nlp"],
    firstSeen: new Date(),
    occurrenceCount: 1
  },
  ...overrides
});

// Test data seeding for integration tests
export const seedTestMemories = async (count: number) => {
  const memories = Array(count).fill(null).map((_, i) =>
    createTestMemoryChunk({
      content: `Test memory ${i} about AI concepts and projects`,
      id: `memory-${i}`
    })
  );

  await bulkInsertMemories(memories);
  await buildKnowledgeGraphFromMemories(memories);
};
```

## Flake Management Strategy

### Flake Detection
```typescript
// Track test run hashes for flake detection
const testRunHashes = new Map<string, string>();

beforeEach(() => {
  // Generate hash of test environment and inputs
  const hash = generateTestHash(currentTest);
  testRunHashes.set(currentTest.title, hash);
});

// In CI/CD pipeline, compare with previous runs
// Auto-quarantine tests with >0.5% variance in pass rate
```

### Quarantine Process
1. **Detection**: Monitor week-over-week pass rate variance
2. **Quarantine**: Auto-label flaky tests with expiry (7 days)
3. **Investigation**: Assign owner and create ticket
4. **Resolution**: Fix or remove quarantined tests within 7 days

## Test Execution Strategy

### CI/CD Pipeline Integration
```yaml
# GitHub Actions workflow
name: Memory Enhancement Tests
on: [pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - run: npm run test:mutation

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:integration

  contract-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:contract

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:e2e:smoke

  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run perf:test
```

## Success Metrics

### Functional Metrics
- **Unit Test Coverage**: ≥80% branch coverage
- **Mutation Score**: ≥50% (Tier 2 requirement)
- **Contract Compliance**: 100% API/GraphQL schema validation
- **Integration Success Rate**: ≥95% across all test suites

### Performance Metrics
- **P95 Latency**: <600ms for hybrid search queries
- **Concurrent Load**: Support 50 simultaneous searches
- **Memory Efficiency**: Knowledge graph scales linearly with corpus size

### Quality Metrics
- **Flake Rate**: <0.5% (target for quarantine)
- **Test Execution Time**: <10 minutes for full suite
- **False Positive Rate**: <5% for entity extraction

## Risk Mitigation

### High-Risk Areas
1. **Graph Traversal Performance**: Implement query complexity limits and early termination
2. **Entity Extraction Quality**: Start with conservative confidence thresholds (≥0.8)
3. **Memory Synchronization**: Atomic operations with rollback capabilities

### Mitigation Strategies
1. **Gradual Rollout**: Feature flags for different memory types
2. **Performance Monitoring**: Real-time metrics and alerting
3. **Fallback Mechanisms**: Graceful degradation to vector-only search
4. **Quality Gates**: Block merges below quality thresholds

This comprehensive test plan ensures the memory enhancement system meets CAWS Tier 2 quality standards with rigorous testing, performance validation, and operational excellence.
