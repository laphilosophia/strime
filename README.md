# JQL

**The fastest streaming JSON projection engine in pure JavaScript.**

Byte-level, zero-allocation, O(1) memory. Built for FinTech, telemetry, and edge runtimes.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-35%2F35-brightgreen.svg)](src/__tests__)

---

## Proof

```bash
# 1,000,000 rows in 4.33 seconds
npm run bench
```

| Metric | Result | Guarantee |
|--------|--------|-----------|
| Throughput | 233k rows/s | O(N) time |
| Memory | 37 MB constant | O(D) space |
| Nesting (1000 levels) | 1.4ms | Stack-safe |

---

## Install

```bash
npm install jql
```

---

## Use

### Query

```typescript
import { query } from 'jql';

const result = await query(data, '{ id, user { name, email } }');
```

### Stream

```typescript
import { ndjsonStream } from 'jql';

for await (const row of ndjsonStream(stream, '{ id, name }')) {
  console.log(row);
}
```

### Fault-Tolerant

```typescript
for await (const row of ndjsonStream(stream, '{ id, name }', {
  skipErrors: true,
  onError: (info) => console.error(`Line ${info.lineNumber}: ${info.error.message}`)
})) {
  console.log(row);
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

---

## Advanced

### Custom Tokenizer

```typescript
import { Tokenizer } from 'jql';

const tokenizer = new Tokenizer();
const buffer = new TextEncoder().encode('{"key": "value"}');

// Iterator (convenient)
for (const token of tokenizer.tokenize(buffer)) {
  console.log(token.type, token.value);
}

// Callback (zero-allocation)
tokenizer.processChunk(buffer, (token) => {
  console.log(token.type, token.value);
});
```

### Error Handling

```typescript
import { JQLError, TokenizationError } from 'jql';

try {
  await query(data, schema);
} catch (error) {
  if (error instanceof TokenizationError) {
    console.error(`Invalid JSON at position ${error.position}`);
  }
}
```

### Real-Time Subscribe

```typescript
import { subscribe } from 'jql';

subscribe(telemetryStream, '{ lat, lon }', {
  onMatch: (data) => console.log(data),
  onComplete: () => console.log('Done')
});
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
```

---

## Docs

- [Performance Contract](docs/performance.md) - Guarantees
- [Internals](docs/internals.md) - How it works
- [API Reference](docs/api-reference.md) - Full API
- [Query Language](docs/query-language.md) - Syntax
- [Changelog](CHANGELOG.md) - What's new

---

## License

MIT © 2026 [laphilosophia](https://github.com/laphilosophia)
