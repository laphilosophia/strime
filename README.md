# Strime

A streaming JSON projection engine. Selects and extracts fields from JSON without parsing the entire structure.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache2.0-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-52%2F52-brightgreen.svg)](src/__tests__)

---

## Why Strime

Most JSON parsers convert the entire input to objects before you can query it. Strime inverts this: it filters during traversal, touching only the bytes you need. The result is constant memory usage regardless of file size—a 10GB file uses the same baseline memory as a 10KB file.

This isn't a marginal improvement. On high-volume workloads, Strime processes JSON at throughputs typically reserved for native implementations.

---

## Performance

| Metric                   | Result         | Guarantee      |
| ------------------------ | -------------- | -------------- |
| Throughput (1GB)         | 809-939 Mbps   | O(N) time      |
| Skip-heavy (chunked)     | **4,408 Mbps** | 6.5x faster    |
| Memory                   | Constant       | O(D) space     |
| 1M NDJSON rows           | ~4.2s          | 220k+ rows/s   |
| Deep nesting (1k levels) | < 1ms          | Stack-safe     |
| Large strings (50MB)     | 1.6 Gbps       | No degradation |

_Validated on 1GB+ files. See [Performance Contract](docs/performance.md) for methodology._

---

## Install

```bash
npm install @laphilosophia/strime
```

---

## Use

### Query

```typescript
import { query } from '@laphilosophia/strime'

const result = await query(data, '{ id, user { name, email } }')
```

### Stream NDJSON

```typescript
import { ndjsonStream } from '@laphilosophia/strime'

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

### Real-Time Subscribe

```typescript
import { subscribe } from '@laphilosophia/strime'

subscribe(telemetryStream, '{ lat, lon }', {
  onMatch: (data) => console.log(data),
  onComplete: () => console.log('Done'),
})
```

### CLI

```bash
strime data.json "{ name, meta { type } }"
cat massive.json | strime "{ actor { login } }"
tail -f telemetry.log | strime --ndjson "{ lat, lon }"
```

---

## Features

**Core**

- Zero-allocation tokenizer with object recycling
- String interning for repeated keys
- Integer fast-path parsing
- Binary line splitting for NDJSON

**API**

- Streaming and pull modes
- Parallel NDJSON processing (`ndjsonParallel`)
- Raw byte emission for zero-copy pipelines
- Compression sink (gzip/brotli)
- Budget enforcement for DoS protection

**Error Handling**

- Typed errors with position tracking
- Fault-tolerant NDJSON streaming
- Controlled termination via AbortSignal

---

## Advanced

### Chunked Execution (Large Files)

For maximum throughput on large single-buffer inputs:

```typescript
import { Engine } from '@laphilosophia/strime'
import { StrimeParser } from '@laphilosophia/strime'
import { readFileSync } from 'fs'

const buffer = readFileSync('large-file.json')
const schema = new StrimeParser('{ id, name }').parse()
const engine = new Engine(schema)

// 6.5x faster on skip-heavy workloads
const result = engine.executeChunked(buffer) // 64KB chunks (default)
const result = engine.executeChunked(buffer, 32768) // Custom 32KB chunks
```

### Low-Level Tokenizer

```typescript
import { Tokenizer } from '@laphilosophia/strime'

const tokenizer = new Tokenizer()
const buffer = new TextEncoder().encode('{"key": "value"}')

// Zero-allocation callback mode
tokenizer.processChunk(buffer, (token) => {
  console.log(token.type, token.value)
})

// Iterator mode
for (const token of tokenizer.tokenize(buffer)) {
  console.log(token.type, token.value)
}
```

### Telemetry

```typescript
await query(stream, '{ id, name }', {
  sink: {
    onStats: (stats) => {
      console.log(`Throughput: ${stats.throughputMbps.toFixed(2)} Mbps`)
      console.log(`Skip ratio: ${(stats.skipRatio * 100).toFixed(1)}%`)
    },
  },
})
```

### Raw Emission

```typescript
await query(stream, '{ items { id } }', {
  emitMode: 'raw',
  sink: {
    onRawMatch: (bytes) => outputStream.write(bytes),
  },
})
```

---

## Documentation

- [Quick Start](docs/quick-start.md) — Getting started
- [Query Language](docs/query-language.md) — Syntax reference
- [API Reference](docs/api-reference.md) — Complete API
- [CLI Guide](docs/cli-guide.md) — Command-line usage
- [Performance](docs/performance.md) — Benchmarks and guarantees
- [Internals](docs/internals.md) — How it works

---

## Licensing

Strime is released under the **Apache 2.0**.

---

## Contact

Erdem Arslan
<me@erdem.work>
