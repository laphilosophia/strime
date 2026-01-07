# JQL

**The fastest streaming JSON projection engine in pure JavaScript.**

Byte-level, zero-allocation, O(1) memory. Built for FinTech, telemetry, and edge runtimes.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-48%2F48-brightgreen.svg)](src/__tests__)

---

## Proof

```bash
# 1GB files in ~12 seconds
npm run bench
```

| Metric                | Result             | Guarantee      |
| --------------------- | ------------------ | -------------- |
| Throughput (1GB avg)  | **686 Mbps**       | O(N) time      |
| Throughput (peak)     | **832 Mbps**       | Consistent     |
| Memory                | 37 MB constant     | O(D) space     |
| Nesting (1000 levels) | 1.4ms              | Stack-safe     |
| Raw Emission          | **-6.3%** overhead | Zero-copy      |
| Large Strings (50MB)  | **1.6 Gbps**       | No degradation |

> **Battle-Proven**: Validated on 1GB+ files with 577K+ records, deep nesting, and parallel processing. [See benchmarks →](docs/performance.md)

---

## Install

```bash
npm install jql
```

---

## Use

### Query

```typescript
import { query } from 'jql'

const result = await query(data, '{ id, user { name, email } }')
```

### Stream

```typescript
import { ndjsonStream } from 'jql'

for await (const row of ndjsonStream(stream, '{ id, name }')) {
  console.log(row)
}
```

### Fault-Tolerant

```typescript
for await (const row of ndjsonStream(stream, '{ id, name }', {
  skipErrors: true,
  onError: (info) => console.error(`Line ${info.lineNumber}: ${info.error.message}`),
})) {
  console.log(row)
}
```

### CLI

```bash
# File
jql data.json "{ name, meta { type } }"

# Pipe
cat massive.json | jql "{ actor.login }"

# NDJSON
tail -f telemetry.log | jql --ndjson "{ lat, lon }"
```

---

## Features

**Performance**

- Zero-allocation tokenizer
- GC-free steady state
- Integer fast-path
- String caching

**Safety**

- Type-safe errors (`JQLError`, `TokenizationError`, `StructuralMismatchError`)
- Position tracking
- DoS protection (`maxLineLength`)
- Fault tolerance (`skipErrors`)

**API**

- Dual tokenizer (callback + iterator)
- Streaming & pull modes
- NDJSON adapter
- Directive system
- **Telemetry** (`onStats` for real-time metrics)
- **Raw emission** (`emitRaw` for zero-copy byte streams)
- **OutputSink** (decoupled data routing)
- **Async Sink** (`onDrain` for graceful shutdown)
- **NDJSON Parallel** (worker pool with ordering)
- **Compression Sink** (gzip/brotli streaming)

---

## Phase 3 Features (NEW)

### Compression Sink

```typescript
import { createCompressionSink } from 'jql'
import { createWriteStream } from 'fs'

await query(largeFile, '{ logs }', {
  emitMode: 'raw',
  sink: createCompressionSink({
    algorithm: 'gzip',
    level: 6,
    output: createWriteStream('output.json.gz'),
    onStats: (stats) => console.log(`Ratio: ${stats.compressionRatio.toFixed(2)}x`),
  }),
})
```

### NDJSON Parallel

```typescript
import { ndjsonParallel } from 'jql'

for await (const row of ndjsonParallel(stream, '{ id, name }', {
  parallel: true,
  workers: 4,
  ordering: 'preserve', // or 'relaxed'
})) {
  console.log(row)
}
```

---

## Advanced

### Custom Tokenizer

```typescript
import { Tokenizer } from 'jql'

const tokenizer = new Tokenizer()
const buffer = new TextEncoder().encode('{"key": "value"}')

// Iterator (convenient)
for (const token of tokenizer.tokenize(buffer)) {
  console.log(token.type, token.value)
}

// Callback (zero-allocation)
tokenizer.processChunk(buffer, (token) => {
  console.log(token.type, token.value)
})
```

### Error Handling

```typescript
import { JQLError, TokenizationError } from 'jql'

try {
  await query(data, schema)
} catch (error) {
  if (error instanceof TokenizationError) {
    console.error(`Invalid JSON at position ${error.position}`)
  }
}
```

### Real-Time Subscribe

```typescript
import { subscribe } from 'jql'

subscribe(telemetryStream, '{ lat, lon }', {
  onMatch: (data) => console.log(data),
  onComplete: () => console.log('Done'),
})
```

### Telemetry

```typescript
import { query } from 'jql'

await query(stream, '{ id, name }', {
  sink: {
    onStats: (stats) => {
      console.log(`Throughput: ${stats.throughputMbps.toFixed(2)} Mbps`)
      console.log(`Skip ratio: ${(stats.skipRatio * 100).toFixed(1)}%`)
    },
  },
})
```

### Raw Emission (Zero-Copy)

```typescript
import { query } from 'jql'

await query(stream, '{ items { id } }', {
  emitMode: 'raw',
  sink: {
    onRawMatch: (bytes) => {
      // Pipe original JSON bytes directly to another stream
      outputStream.write(bytes)
    },
  },
})
```

---

## Benchmarks

```
Payload: 1.65 MB (10k items)

Full Selection:     29ms
Skip-Heavy:         25ms
Indexed Query:      21ms

Large File: 25 MB

Streaming:          255ms
Deep Extraction:    245ms
ReadableStream:     260ms

Stress Test: 1 GB

Simple Projection:  10.07s (875.84 Mbps)
Nested Projection:  10.15s (869.22 Mbps)
Multi-Field:        10.01s (880.62 Mbps)
```

---

## Docs

- [Performance Contract](docs/performance.md) - Guarantees
- [Internals](docs/internals.md) - How it works
- [API Reference](docs/api-reference.md) - Full API
- [Query Language](docs/query-language.md) - Syntax
- [Changelog](CHANGELOG.md) - What's new

---

## Licensing

JQL is released under the **Business Source License (BSL)**.

This means:

- ✅ The source code is fully available and auditable
- ✅ Free to use for learning, experimentation, and open-source projects
- ❌ Commercial and hosted use requires a commercial license

After the Change Date (see LICENSE file), JQL Core will automatically transition to
the **Apache 2.0 License**, becoming fully open source.

### Why this model?

JQL is a performance-critical infrastructure component built with significant
engineering effort.
The BSL model allows us to:

- Keep development transparent
- Protect early-stage sustainability
- Commit to full open-source availability long-term

If you are interested in commercial use, please contact us.

---

### Trademark Notice

"JQL" and the JQL logo are trademarks of the Licensor.
Forks and derivative works must not use the JQL name or branding
in a way that suggests official endorsement.

---

## Contact

Erdem Arslan
<erdemarslan@ymail.com>
