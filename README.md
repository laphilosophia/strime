# JQL (JSON Query Language) 🚀

**A high-performance, streaming-first JSON projection engine for massive datasets.**

JQL is designed to extract specific data from large JSON files (100MB to 10GB+) with **constant memory overhead** and **linear traversal speed**. By using a Layered FSM (Finite State Machine) architecture, JQL avoids the "full parse" bottleneck of traditional `JSON.parse()`.

---

## ✨ Features

- **Layered FSM Engine**: Byte-level processing with no backtracking.
- **$O(1)$ Memory Overhead**: Memory usage is proportional to JSON depth, not payload size.
- **Automatic Byte-Skipping**: Irrelevant subtrees are skipped at the primitive level without semantic parsing.
- **Native Streaming**: First-class support for `ReadableStream<Uint8Array>`.
- **GraphQL-like Selection**: Declarative syntax for data extraction.
- **Directives & Aliases**: Built-in `@alias`, `@coerce`, `@default`, and `@substring` support.
- **Progressive Indexing**: Ephemeral root-key offset caching for optimized repeated queries.

---

## 🚀 Quick Start

### Installation

```bash
npm install jql
```

### Basic Usage (Pull-Mode)

```typescript
import { build } from 'jql';

// Stream a massive JSON from any source
const jql = build(stream);

const result = await jql.read(`{
  id,
  user: profile.name @substring(len: 10),
  balance @coerce(type: "number") @default(value: 0)
}`);
```

### Real-Time Usage (Push-Mode)

For high-intensity telemetry or logs, use the `subscribe` API to receive matches as they materialize.

```typescript
import { subscribe } from 'jql';

const sub = subscribe(ReadableStream, '{ lat, lon, speed }', {
  onMatch: (data) => console.log('New Match:', data),
  onComplete: () => console.log('Stream finished'),
  onError: (err) => console.error('Stream failure:', err)
});

// sub.unsubscribe(); // Stop anytime
```

---

## Test Data

1M Row Flight Data

```bash
curl -C - -L -o data.json "https://agents-for-data-prod-tmp.8e464e4039ccd5897a90175399bb04a7.r2.cloudflarestorage.com/2026-01-05/7ab6aa37-50c2-4b12-93ce-cc5769bc56f4/flights-1m.json?X-Amz-Expires=3600&X-Amz-Date=20260105T101819Z&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=7283c8cfa964ae1d21c994a61ac3c987%2F20260105%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-SignedHeaders=host&X-Amz-Signature=6cc8988f2d75adcfb932b9fb333dc7bacfd349656f6547452e0b69dac465ebf3"
```

---

## 💻 CLI Usage

JQL comes with a high-performance CLI for terminal-based projection.

```bash
# 1. Direct file projection
jql data.json "{ id, name }"

# 2. Piping from stdin
cat massive.json | jql "{ actor.login }"

# 3. High-performance NDJSON (Line-delimited) processing
tail -f telemetery.log | jql --ndjson "{ lat, lon }"
```

> [!TIP]
> Use the `--ndjson` flag for line-delimited JSON files to enable FSM recycling, which significantly reduces GC pressure on massive streams.

---

## 📊 Performance Contract

JQL is optimized for **throughput** and **resource isolation**.

| Metric | Streaming Mode | Indexed Mode |
| :--- | :--- | :--- |
| **Time Complexity** | $O(N)$ (Single Pass) | Sub-linear (Jump Access) |
| **Memory Cost** | $O(Depth)$ | $O(Depth + IndexSize)$ |
| **Data Skipping** | ✅ Automatic | ✅ Optimized |

> [!IMPORTANT]
> JQL is a **Projection Engine**, not a compute engine. It excels at *finding* and *preparing* data for your application logic.

---

## 🛠️ Documentation

- **[Mental Model](docs/mental_model.md)**: "JQL does not parse JSON; it moves through it."
- **[Performance Contract](docs/performance_contract.md)**: Hard guarantees and complexity analysis.
- **[Capability Matrix](docs/capabilities.md)**: What JQL can and cannot do.
- **[Error Semantics](docs/error_semantics.md)**: Abort vs. Safe fallback policies.
- **[Non-Goals](docs/non_goals.md)**: Preventing scope creep.
- **[Technical Spec (V2)](docs/jql_v2_spec.md)**: FSM State Diagrams and implementation details.

---

## ⚖️ License

MIT © 2026 JQL Maintainers
