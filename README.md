# JQL (JSON Query Language)

**JQL is one of the fastest streaming JSON projection engines in pure JavaScript — and the only one designed to run safely at the edge**

JQL is a byte-level, zero-allocation streaming engine designed for the high-performance requirements of FinTech, telemetry, and edge runtimes. It projects specific fields from massive JSON streams with **constant memory overhead** and **near-native speeds**.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build: Battle-Tested](https://img.shields.io/badge/Build-Battle--Tested-blue.svg)](docs/performance.md)

---

## � Performance at a Glance

JQL is optimized for **throughput** and **resource isolation**.

- **1,000,000 Rows**: Processed in **4.22s** (~230k matches/s).
- **Constant Memory**: Stable $O(Depth)$ heap usage, regardless of payload size (1MB or 10GB).
- **Zero Allocation**: Allocation-free hot loop and GC-free steady state.

---

## �️ CLI Usage

JQL provides a high-speed terminal tool for data analysis.

```bash
# 1. Simple file projection
jql data.json "{ name, meta { type } }"

# 2. Piping from stdin
cat massive.json | jql "{ actor.login }"

# 3. High-performance NDJSON / JSONL (Line-delimited) processing
tail -f telemetery.log | jql --jsonl "{ lat, lon }"
```

> [!TIP]
> Use the `--ndjson` flag for line-delimited files to enable FSM recycling, which significantly reduces GC pressure on massive streams.

---

## � Programmatic Usage

### Pull-Mode (Standard)

```typescript
import { read } from 'jql';

const result = await read(stream, '{ id, name }');
```

### Push-Mode (Real-time)

```typescript
import { subscribe } from 'jql';

subscribe(telemetryStream, '{ lat, lon }', {
  onMatch: (data) => console.log('Match!', data),
  onComplete: () => console.log('Done.')
});
```

### Fault-Tolerant NDJSON (New in v2.2.1)

```typescript
import { ndjsonStream } from 'jql';

for await (const result of ndjsonStream(stream, '{ id, name }', {
  skipErrors: true,  // Continue processing on errors
  onError: (info) => {
    console.error(`Line ${info.lineNumber}: ${info.error.message}`);
  },
  maxLineLength: 10 * 1024 * 1024  // 10MB DoS protection
})) {
  console.log(result);
}
```

---

## ✨ What's New in v2.2.1

### 🔄 Dual Tokenizer API

Choose between callback (zero-allocation) or iterator (convenience):

```typescript
import { Tokenizer } from 'jql';

const tokenizer = new Tokenizer();
const buffer = new TextEncoder().encode('{"key": "value"}');

// Iterator API - convenient, each token is a new object
for (const token of tokenizer.tokenize(buffer)) {
  console.log(token.type, token.value);
}

// Callback API - zero-allocation, token is reused
tokenizer.processChunk(buffer, (token) => {
  console.log(token.type, token.value);
  // Clone if you need to store: { ...token }
});
```

### 🛡️ Production-Grade Error Handling

- **Proper Error Types**: `JQLError`, `TokenizationError`, `ParseError`, `StructuralMismatchError`
- **Position Tracking**: Know exactly where errors occurred
- **Fault Tolerance**: Skip corrupt lines in NDJSON streams
- **DoS Protection**: `maxLineLength` prevents memory exhaustion

```typescript
import { JQLError, TokenizationError } from 'jql';

try {
  const result = await query(data, '{ id, name }');
} catch (error) {
  if (error instanceof TokenizationError) {
    console.error(`Invalid JSON at position ${error.position}`);
  } else if (error instanceof JQLError) {
    console.error(`JQL Error [${error.code}]: ${error.message}`);
  }
}
```

---

## 📚 Documentation

Dive deeper into the details:

- [**Documentation Index**](docs/README.md) - The starting point for all guides.
- [**Query Language Guide**](docs/query-language.md) - Syntax and Directives.
- [**API Reference**](docs/api-reference.md) - Runtimes and Adapters.
- [**Internals Deep-Dive**](docs/internals.md) - How we achieved near-native speed.
- [**Performance Contract**](docs/performance.md) - Our ironclad guarantees.

---

## ⚖️ License

MIT © 2026 laphilosophia
