# Strime API Reference

This document provides the complete public API surface of Strime. All signatures are verified against the source code.

## Runtime

### `query<T>(source, schema, options?): Promise<T>`

One-shot query execution. Parses the schema, processes the source, and returns the projected result.

```ts
import { query } from '@laphilosophia/strime'

const result = await query(data, '{ id, name }')
```

**Parameters:**

- `source`: `string | Uint8Array | object | ReadableStream<Uint8Array>`
- `schema`: `string` — Strime query
- `options`: `StrimeOptions` (optional)

### `build(source, options?): StrimeInstance`

Creates a reusable instance for multiple queries against the same source.

```ts
import { build } from '@laphilosophia/strime'

const instance = build(buffer, { mode: 'indexed' })
const result = await instance.read('{ id }')
```

**Parameters:**

- `source`: `string | Uint8Array | object | ReadableStream<Uint8Array>`
- `options`: `StrimeOptions` (optional)

**Returns:** `{ read<T>(schema: string): Promise<T> }`

### `subscribe(stream, schema, options): StrimeSubscription`

Push-mode subscription for real-time processing.

```ts
import { subscribe } from '@laphilosophia/strime'

const sub = subscribe(stream, '{ id }', {
  onMatch: (data) => console.log(data),
  onComplete: () => console.log('done'),
  onError: (err) => console.error(err),
})

sub.unsubscribe() // Cancel
```

**Parameters:**

- `stream`: `ReadableStream<Uint8Array>`
- `schema`: `string`
- `options`: `SubscriptionOptions`

## Options

### `StrimeOptions`

```ts
interface StrimeOptions {
  mode?: 'streaming' | 'indexed'
  debug?: boolean
  signal?: AbortSignal
  budget?: {
    maxMatches?: number
    maxBytes?: number
    maxDurationMs?: number
  }
  onMatch?: (data: any) => void
  sink?: OutputSink
  emitMode?: 'object' | 'raw'
}
```

### `SubscriptionOptions`

```ts
interface SubscriptionOptions {
  onMatch: (data: any) => void
  onComplete?: () => void
  onError?: (err: Error) => void
  debug?: boolean
  signal?: AbortSignal
  budget?: { maxMatches?: number; maxBytes?: number; maxDurationMs?: number }
}
```

## Adapters

### `ndjsonStream(stream, schema, options?): AsyncGenerator`

NDJSON adapter with fault tolerance.

```ts
import { ndjsonStream } from '@laphilosophia/strime'

for await (const row of ndjsonStream(stream, '{ id }', { skipErrors: true })) {
  // Process row
}
```

### `NDJSONOptions`

```ts
interface NDJSONOptions {
  debug?: boolean
  skipErrors?: boolean
  onError?: (info: NDJSONErrorInfo) => void
  maxLineLength?: number // Default: 10MB
  signal?: AbortSignal
  budget?: { maxMatches?: number; maxBytes?: number; maxDurationMs?: number }
}

interface NDJSONErrorInfo {
  error: StrimeError
  lineNumber: number
  lineContent: string
}
```

### `ndjsonParallel(stream, schema, options?): AsyncGenerator`

Parallel NDJSON processing using worker threads.

```ts
import { ndjsonParallel } from '@laphilosophia/strime'

for await (const row of ndjsonParallel(stream, '{ id }', { workers: 4 })) {
  // Process row
}
```

## Core Engine

Low-level APIs for custom adapters.

### `Engine`

```ts
import { Engine } from '@laphilosophia/strime'
import { StrimeParser } from '@laphilosophia/strime'

const schema = new StrimeParser('{ id, name }').parse()
const engine = new Engine(schema, options)

// Standard execution
const result = engine.execute(buffer)

// Chunked execution (6.5x faster on skip-heavy workloads)
const result = engine.executeChunked(buffer) // 64KB default
const result = engine.executeChunked(buffer, 32768) // Custom chunk size

// Streaming (manual chunk processing)
engine.processChunk(chunk1)
engine.processChunk(chunk2)
const result = engine.getResult()

// Recycle for next document
engine.reset()
```

**Methods:**

- `execute(buffer)`: Single-buffer execution
- `executeChunked(buffer, chunkSize?)`: Chunked execution for large buffers (default: 64KB)
- `processChunk(chunk)`: Process a single chunk (streaming mode)
- `getResult()`: Retrieve the parsed result
- `getStats()`: Retrieve performance telemetry
- `reset()`: Clear state for reuse

### `Tokenizer`

```ts
import { Tokenizer } from '@laphilosophia/strime'

const tokenizer = new Tokenizer()

// Callback mode (zero allocation)
tokenizer.processChunk(chunk, (token) => {
  console.log(token.type, token.value)
})

// Iterator mode
for (const token of tokenizer.tokenize(chunk)) {
  console.log(token.type, token.value)
}
```

### `StrimeParser`

```ts
import { StrimeParser } from '@laphilosophia/strime'

const parser = new StrimeParser('{ id, name }')
const selectionMap = parser.parse()
```

## Sinks

### `createCompressionSink(options): OutputSink`

Output sink with optional compression.

```ts
import { createCompressionSink } from '@laphilosophia/strime'

const sink = createCompressionSink({
  onChunk: (chunk) => stream.write(chunk),
  compression: 'gzip',
})
```

## Error Classes

All errors extend `StrimeError`:

```ts
import {
  StrimeError,
  TokenizationError,
  ParseError,
  StructuralMismatchError,
  AbortError,
  BudgetExhaustedError,
} from '@laphilosophia/strime'
```

See [Error Handling](error-handling.md) for details.

## Types

### `Token`

```ts
interface Token {
  type: TokenType
  value?: unknown
  start: number // Byte offset
  end: number
}
```

### `TokenType`

```ts
enum TokenType {
  LEFT_BRACE,
  RIGHT_BRACE,
  LEFT_BRACKET,
  RIGHT_BRACKET,
  COLON,
  COMMA,
  STRING,
  NUMBER,
  TRUE,
  FALSE,
  NULL,
  EOF,
}
```
