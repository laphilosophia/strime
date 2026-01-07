# JQL

A streaming JSON projection engine. Selects and extracts fields from JSON without parsing the entire structure.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-48%2F48-brightgreen.svg)](src/__tests__)

---

## Why JQL

Most JSON parsers convert the entire input to objects before you can query it. JQL inverts this: it filters during traversal, touching only the bytes you need. The result is constant memory usage regardless of file size—a 10GB file uses the same baseline memory as a 10KB file.

This isn't a marginal improvement. On high-volume workloads, JQL processes JSON at throughputs typically reserved for native implementations.

---

## Performance

| Metric | Result | Guarantee |
|--------|--------|-----------|
| Throughput (1GB) | 809-939 Mbps | O(N) time |
| Memory | Constant | O(D) space |
| 1M NDJSON rows | ~4.2s | 220k+ rows/s |
| Deep nesting (1k levels) | < 1ms | Stack-safe |
| Large strings (50MB) | 1.6 Gbps | No degradation |

*Validated on 1GB+ files. See [Performance Contract](docs/performance.md) for methodology.*

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

### Stream NDJSON

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

### Real-Time Subscribe

```typescript
import { subscribe } from 'jql'

subscribe(telemetryStream, '{ lat, lon }', {
  onMatch: (data) => console.log(data),
  onComplete: () => console.log('Done'),
})
```

### CLI

```bash
jql data.json "{ name, meta { type } }"
cat massive.json | jql "{ actor { login } }"
tail -f telemetry.log | jql --ndjson "{ lat, lon }"
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

### Low-Level Tokenizer

```typescript
import { Tokenizer } from 'jql'

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

JQL is released under the **Business Source License (BSL)**.

- ✅ Source code is fully available and auditable
- ✅ Free for learning, experimentation, and open-source projects
- ❌ Commercial and hosted use requires a commercial license

After the Change Date (see LICENSE file), JQL Core will automatically transition to the **Apache 2.0 License**.

### Why this model?

JQL is a performance-critical infrastructure component. The BSL model allows transparent development while protecting early-stage sustainability, with a commitment to full open-source availability long-term.

For commercial licensing, please contact us.

---

### Trademark Notice

"JQL" and the JQL logo are trademarks of the Licensor. Forks and derivative works must not use the JQL name or branding in a way that suggests official endorsement.

---

## Contact

Erdem Arslan
<erdemarslan@ymail.com>
