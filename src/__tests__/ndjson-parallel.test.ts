import { describe, expect, it } from 'vitest'
import { ndjsonParallel } from '../adapters/ndjson-parallel'

/**
 * NDJSON Parallel Adapter Tests
 *
 * Note: Parallel mode tests are skipped in development because worker_threads
 * with TypeScript requires experimental loaders. Parallel mode is tested
 * post-build as integration tests with compiled .js files.
 *
 * To test parallel mode:
 * 1. npm run build
 * 2. Run integration tests against dist/
 */

// Skip parallel tests in development (TypeScript source)
const SKIP_PARALLEL_TESTS = true

describe('NDJSON Parallel Adapter', () => {
  // Helper to create NDJSON stream
  function createNDJSONStream(lines: any[]): ReadableStream<Uint8Array> {
    const ndjson = lines.map((obj) => JSON.stringify(obj)).join('\n')
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ndjson))
        controller.close()
      },
    })
  }

  // Serial mode tests (always run)
  describe('Serial Mode', () => {
    it('should fall back to serial mode when parallel is false', async () => {
      const data = Array.from({ length: 10 }, (_, i) => ({ id: i }))
      const stream = createNDJSONStream(data)
      const results = []

      for await (const result of ndjsonParallel(stream, '{ id }', {
        parallel: false,
      })) {
        results.push(result)
      }

      expect(results).toHaveLength(10)
      expect(results[0].id).toBe(0)
      expect(results[9].id).toBe(9)
    })

    it('should handle complex queries in serial mode', async () => {
      const data = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        user: {
          name: `User${i}`,
          email: `user${i}@example.com`,
          address: {
            city: `City${i}`,
            zip: `${10000 + i}`,
          },
        },
      }))

      const stream = createNDJSONStream(data)
      const results = []

      for await (const result of ndjsonParallel(stream, '{ id, user { name, address { city } } }', {
        parallel: false,
      })) {
        results.push(result)
      }

      expect(results).toHaveLength(50)
      expect(results[0]).toEqual({
        id: 0,
        user: {
          name: 'User0',
          address: { city: 'City0' },
        },
      })
    })

    it('should handle chunked streams with cross-chunk lines', async () => {
      const part1 = '{"id": 1, "name": "Ali'
      const part2 = 'ce"}\n{"id": 2, "name": "Bob"}\n'

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(part1))
          controller.enqueue(new TextEncoder().encode(part2))
          controller.close()
        },
      })

      const results = []
      for await (const result of ndjsonParallel(stream, '{ id, name }', {
        parallel: false,
      })) {
        results.push(result)
      }

      expect(results).toHaveLength(2)
      expect(results[0]).toEqual({ id: 1, name: 'Alice' })
      expect(results[1]).toEqual({ id: 2, name: 'Bob' })
    })
  })

  // Parallel mode tests (post-build integration tests)
  describe.skipIf(SKIP_PARALLEL_TESTS)('Parallel Mode (Post-Build Integration)', () => {
    it('should process in parallel mode and match serial results', async () => {
      const data = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        name: `User${i}`,
      }))

      const stream = createNDJSONStream(data)
      const results = []

      for await (const result of ndjsonParallel(stream, '{ id, name }', {
        parallel: true,
        workers: 4,
        ordering: 'preserve',
      })) {
        results.push(result)
      }

      expect(results).toHaveLength(50)
      expect(results[0]).toEqual({ id: 0, name: 'User0' })
      expect(results[49]).toEqual({ id: 49, name: 'User49' })
    })

    it('should preserve order in preserve mode', async () => {
      const data = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        value: Math.random(),
      }))

      const stream = createNDJSONStream(data)
      const results = []

      for await (const result of ndjsonParallel(stream, '{ id }', {
        parallel: true,
        workers: 4,
        ordering: 'preserve',
      })) {
        results.push(result)
      }

      expect(results).toHaveLength(100)
      // Verify strict ordering
      for (let i = 0; i < 100; i++) {
        expect(results[i].id).toBe(i)
      }
    })

    it('should process all items in relaxed mode', async () => {
      const data = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        value: Math.random(),
      }))

      const stream = createNDJSONStream(data)
      const results = []

      for await (const result of ndjsonParallel(stream, '{ id }', {
        parallel: true,
        workers: 4,
        ordering: 'relaxed',
      })) {
        results.push(result)
      }

      expect(results).toHaveLength(100)
      // Verify all IDs are present (order may vary)
      const ids = results.map((r) => r.id).sort((a, b) => a - b)
      expect(ids).toEqual(Array.from({ length: 100 }, (_, i) => i))
    })

    it('should work with different worker pool sizes', async () => {
      const data = Array.from({ length: 20 }, (_, i) => ({ id: i }))

      for (const workers of [1, 2, 4, 8]) {
        const stream = createNDJSONStream(data)
        const results = []

        for await (const result of ndjsonParallel(stream, '{ id }', {
          parallel: true,
          workers,
          ordering: 'preserve',
        })) {
          results.push(result)
        }

        expect(results).toHaveLength(20)
        expect(results[0].id).toBe(0)
        expect(results[19].id).toBe(19)
      }
    })

    it('should handle backpressure with large datasets', async () => {
      const data = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `User${i}`,
        email: `user${i}@example.com`,
      }))

      const stream = createNDJSONStream(data)
      const results = []

      for await (const result of ndjsonParallel(stream, '{ id, name }', {
        parallel: true,
        workers: 4,
        ordering: 'preserve',
      })) {
        results.push(result)
      }

      expect(results).toHaveLength(1000)
      // Verify ordering is preserved
      for (let i = 0; i < 1000; i++) {
        expect(results[i].id).toBe(i)
      }
    })

    it('should handle errors in parallel mode', async () => {
      const lines = [
        JSON.stringify({ id: 1, name: 'Alice' }),
        '{ invalid json }',
        JSON.stringify({ id: 2, name: 'Bob' }),
      ].join('\n')

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(lines))
          controller.close()
        },
      })

      await expect(async () => {
        const results = []
        for await (const result of ndjsonParallel(stream, '{ id, name }', {
          parallel: true,
          workers: 2,
        })) {
          results.push(result)
        }
      }).rejects.toThrow()
    })

    it('should handle empty streams gracefully', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      const results = []
      for await (const result of ndjsonParallel(stream, '{ id }', {
        parallel: true,
        workers: 4,
      })) {
        results.push(result)
      }

      expect(results).toHaveLength(0)
    })
  })
})
