# Strime Performance Contract

This document establishes the computational guarantees of the Strime engine and presents validation data from controlled benchmarks. The claims made here are empirically grounded and bounded by the constraints described in [Capabilities](capabilities.md).

## Complexity Guarantees

Strime's execution model provides the following complexity bounds:

**Time Complexity**

- Streaming mode: O(N) where N is the byte count of the source. Each byte is visited at most once during a forward-only traversal.
- Indexed mode: O(K + S) where K is the number of requested root-level keys and S is the aggregate size of selected subtrees. The index lookup is O(1) per key.

**Memory Complexity**

- O(D) where D is the maximum nesting depth of the JSON. Memory usage is independent of payload size—a 1GB file with depth 10 uses the same baseline memory as a 10KB file with the same structure.

These bounds are structural consequences of the forward-only design, not optimizations layered on top of a general-purpose parser.

## Directive Execution Budget

Directives are constrained to prevent resource exhaustion from pathological inputs:

| Directive       | Constraint                  | Rationale                            |
| --------------- | --------------------------- | ------------------------------------ |
| `@substring`    | 10,000 character cap        | Prevents unbounded string allocation |
| `@formatNumber` | 20 decimal place cap        | Prevents precision explosion         |
| All directives  | O(1) relative to node value | Preserves linear overall traversal   |

## Benchmark Suite

Strime maintains a comprehensive benchmark suite to validate performance guarantees. These tests are executed against every release candidate.

### Extreme Nesting Stress Test

Tests stack safety with 1000-level deep JSON structures:

```ts
// src/benchmarks/battle_test.ts
async function testExtremeNesting(depth: number) {
  let json = '{"root":'
  for (let i = 0; i < depth; i++) json += '{"node":'
  json += '"target"'
  for (let i = 0; i < depth; i++) json += '}'
  json += '}'

  const buffer = new TextEncoder().encode(json)
  const map = new StrimeParser('{ root }').parse()
  const engine = new Engine(map)

  const start = performance.now()
  const result = engine.execute(buffer)
  const end = performance.now()
  // Target: < 2ms for 1000 levels
}
```

This test validates that the stack-based FSM handles arbitrary nesting without recursion-based stack overflow.

### Million-Row Streaming Test

Validates sustained throughput and memory stability over 1 million NDJSON rows:

```ts
// src/benchmarks/battle_test.ts
async function testMassiveStreaming(rowCount: number) {
  const stream = new ReadableStream({
    pull(controller) {
      for (let i = 0; i < 1000 && enqueued < rowCount; i++, enqueued++) {
        const item = {
          id: enqueued,
          timestamp: Date.now(),
          data: 'X'.repeat(100),
          meta: { index: enqueued, type: 'telemetry' },
        }
        controller.enqueue(new TextEncoder().encode(JSON.stringify(item) + '\n'))
      }
      if (enqueued >= rowCount) controller.close()
    },
  })

  for await (const match of ndjsonStream(stream, '{ id, meta { type } }')) {
    processed++
    // Memory logged every 250k rows to detect leaks
  }
  // Target: < 4.5s for 1M rows, memory stable
}
```

### Large File Throughput Test

Measures raw throughput on 1GB+ payloads:

```ts
// src/test/v3_simple_benchmark.ts
async function simpleBenchmark() {
  const buffer = readFileSync('data/1GB.json')

  // Warmup run
  await query(buffer, '{ id }')

  // 3 measured runs
  const times: number[] = []
  for (let i = 0; i < 3; i++) {
    const start = performance.now()
    await query(buffer, '{ id }')
    times.push(performance.now() - start)
  }

  const median = times.sort((a, b) => a - b)[1]
  const throughput = (buffer.length * 8) / (median * 1000) // Mbps
  // Target: > 800 Mbps sustained
}
```

## Benchmark Results

| Test                   | Target       | Measured       | Status |
| ---------------------- | ------------ | -------------- | ------ |
| 1M NDJSON rows         | < 4.5s       | ~4.2s          | ✓      |
| 1GB throughput         | > 800 Mbps   | 809-939 Mbps   | ✓      |
| **Chunked skip-heavy** | **> 2 Gbps** | **4,408 Mbps** | **✓**  |
| Deep nesting (1k)      | < 2ms        | < 1ms          | ✓      |
| Skip vs Select ratio   | < 2x         | 0.91x          | ✓      |
| Memory stability       | Flat         | Confirmed      | ✓      |

### Zero-Copy Raw Emission

| Mode        | Throughput | Overhead |
| ----------- | ---------- | -------- |
| Object Mode | 879 Mbps   | baseline |
| Raw Mode    | 939 Mbps   | -6.3%    |

### Pathological String Handling

| Scenario            | Throughput | Ratio    |
| ------------------- | ---------- | -------- |
| Skip 50MB strings   | 1514 Mbps  | baseline |
| Select 50MB strings | 1665 Mbps  | 0.91x    |

The 0.91x ratio demonstrates no pathological degradation on large values.

### Chunked Execution (v3.2.2+)

For skip-heavy workloads on large single-buffer inputs, `executeChunked()` enables byte-level skip optimization:

| Method                      | Throughput | vs Baseline |
| --------------------------- | ---------- | ----------- |
| `execute()` (single buffer) | 668 Mbps   | —           |
| `executeChunked(64KB)`      | 4,365 Mbps | +553%       |
| `executeChunked(32KB)`      | 4,408 Mbps | +560%       |

**Mechanism**: Byte-level skip activates at chunk boundaries. When a structure is skipped, subsequent chunks bypass the tokenizer entirely, scanning only for bracket/quote characters in a tight loop.

**When to use**: Large files loaded entirely into memory where the query skips significant portions of the input.

```ts
const engine = new Engine(schema)
const result = engine.executeChunked(buffer, 64 * 1024) // 64KB chunks
```

## Regression Thresholds

Every release must pass these thresholds:

| Benchmark                | Threshold | Consequence of Failure |
| ------------------------ | --------- | ---------------------- |
| 1M NDJSON                | < 4.5s    | Release blocked        |
| 1GB stress               | < 11s     | Release blocked        |
| Raw mode overhead        | < 5%      | Release blocked        |
| Large string select/skip | < 2x      | Release blocked        |

## Interpretation Notes

The throughput figures represent sustained rates on the specific hardware used for benchmarking (development workstation, Node.js LTS). Performance on different hardware, under memory pressure, or with different JSON structural characteristics may vary. The complexity bounds, however, are invariant—O(N) time and O(D) memory hold regardless of environment.

---

References:

- Benchmark methodology follows patterns from V8 engine performance testing
- Throughput measurements use `performance.now()` for sub-millisecond precision
