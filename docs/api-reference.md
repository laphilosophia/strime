# JQL API Reference

This document provides the complete public API surface of JQL. All signatures are verified against the source code.

## Runtime

### `query<T>(source, schema, options?): Promise<T>`

One-shot query execution. Parses the schema, processes the source, and returns the projected result.

```ts
import { query } from 'jql'

const result = await query(data, '{ id, name }')
```

**Parameters:**

- `source`: `string | Uint8Array | object | ReadableStream<Uint8Array>`
- `schema`: `string` — JQL query
- `options`: `JQLOptions` (optional)

### `build(source, options?): JQLInstance`

Creates a reusable instance for multiple queries against the same source.

```ts
import { build } from 'jql'

const instance = build(buffer, { mode: 'indexed' })
const result = await instance.read('{ id }')
```

**Parameters:**

- `source`: `string | Uint8Array | object | ReadableStream<Uint8Array>`
- `options`: `JQLOptions` (optional)

**Returns:** `{ read<T>(schema: string): Promise<T> }`

### `subscribe(stream, schema, options): JQLSubscription`

Push-mode subscription for real-time processing.

```ts
import { subscribe } from 'jql'

const sub = subscribe(stream, '{ id }', {
  onMatch: (data) => console.log(data),
  onComplete: () => console.log('done'),
  onError: (err) => console.error(err)
})

sub.unsubscribe()  // Cancel
```

**Parameters:**

- `stream`: `ReadableStream<Uint8Array>`
- `schema`: `string`
- `options`: `SubscriptionOptions`

## Options

### `JQLOptions`

```ts
interface JQLOptions {
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
import { ndjsonStream } from 'jql'

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
  maxLineLength?: number  // Default: 10MB
  signal?: AbortSignal
  budget?: { maxMatches?: number; maxBytes?: number; maxDurationMs?: number }
}

interface NDJSONErrorInfo {
  error: JQLError
  lineNumber: number
  lineContent: string
}
```

### `ndjsonParallel(stream, schema, options?): AsyncGenerator`

Parallel NDJSON processing using worker threads.

```ts
import { ndjsonParallel } from 'jql'

for await (const row of ndjsonParallel(stream, '{ id }', { workers: 4 })) {
  // Process row
}
```

## Core Engine

Low-level APIs for custom adapters.

### `Engine`

```ts
import { Engine } from 'jql'

const engine = new Engine(selectionMap, options)
engine.processChunk(chunk)
const result = engine.getResult()
engine.reset()  // Recycle for next document
```

### `Tokenizer`

```ts
import { Tokenizer } from 'jql'

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

### `JQLParser`

```ts
import { JQLParser } from 'jql'

const parser = new JQLParser('{ id, name }')
const selectionMap = parser.parse()
```

## Sinks

### `createCompressionSink(options): OutputSink`

Output sink with optional compression.

```ts
import { createCompressionSink } from 'jql'

const sink = createCompressionSink({
  onChunk: (chunk) => stream.write(chunk),
  compression: 'gzip'
})
```

## Error Classes

All errors extend `JQLError`:

```ts
import {
  JQLError,
  TokenizationError,
  ParseError,
  StructuralMismatchError,
  AbortError,
  BudgetExhaustedError
} from 'jql'
```

See [Error Handling](error-handling.md) for details.

## Types

### `Token`

```ts
interface Token {
  type: TokenType
  value?: unknown
  start: number   // Byte offset
  end: number
}
```

### `TokenType`

```ts
enum TokenType {
  LEFT_BRACE, RIGHT_BRACE,
  LEFT_BRACKET, RIGHT_BRACKET,
  COLON, COMMA,
  STRING, NUMBER,
  TRUE, FALSE, NULL,
  EOF
}
```
