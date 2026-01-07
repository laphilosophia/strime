# Quick Start

This guide covers installation and core usage patterns. For detailed reference, see [Query Language](query-language.md) and [API Reference](api-reference.md).

## Installation

```bash
npm install strime
```

## Basic Usage

### Object Projection

```ts
import { query } from 'strime'

const user = {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com',
  password: 'secret123',
  metadata: { role: 'admin', lastLogin: '2026-01-05' }
}

const result = await query(user, '{ id, name, metadata { role } }')
// { id: 1, name: 'Alice', metadata: { role: 'admin' } }
```

### Array Projection

```ts
const users = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' }
]

const result = await query(users, '{ name, email }')
// [{ name: 'Alice', email: '...' }, { name: 'Bob', email: '...' }]
```

## Streaming NDJSON

Process large files without loading into memory:

```ts
import { ndjsonStream } from 'strime'
import { createReadStream } from 'fs'

const stream = createReadStream('logs.ndjson')

for await (const row of ndjsonStream(stream, '{ timestamp, level, message }')) {
  console.log(row)
}
```

### Fault-Tolerant Streaming

Skip malformed lines and continue processing:

```ts
for await (const row of ndjsonStream(stream, '{ id, name }', {
  skipErrors: true,
  onError: (info) => console.error(`Line ${info.lineNumber}: ${info.error.message}`)
})) {
  // Valid rows only
}
```

## Push-Mode Subscription

For real-time processing with callback:

```ts
import { subscribe } from 'strime'

const subscription = subscribe(stream, '{ deviceId, temperature }', {
  onMatch: (data) => {
    if (data.temperature > 80) console.warn(`Overheating: ${data.deviceId}`)
  },
  onComplete: () => console.log('Stream ended'),
  onError: (err) => console.error(err)
})

// Later: subscription.unsubscribe()
```

## Instance Builder

For multiple queries against the same source:

```ts
import { build } from 'strime'

const instance = build(buffer, { mode: 'indexed' })

const ids = await instance.read('{ id }')
const names = await instance.read('{ name }')
// Second query benefits from index
```

## Directives

```ts
// Default values
await query(data, '{ status @default(value: "unknown") }')

// String truncation
await query(data, '{ bio @substring(start: 0, len: 100) }')

// Number formatting
await query(data, '{ price @formatNumber(dec: 2) }')

// Field aliasing
await query(data, '{ username: account_login }')
```

## CLI

```bash
# Query a file
strime data.json "{ name, email }"

# Pipe from stdin
curl https://api.example.com/users | strime "{ login, id }"

# Process NDJSON
tail -f logs.ndjson | strime --ndjson "{ timestamp, level }"
```

## Next Steps

- [Query Language](query-language.md) — Full syntax reference
- [API Reference](api-reference.md) — Complete API documentation
- [Capabilities](capabilities.md) — Execution guarantees
- [Performance](performance.md) — Benchmarks and complexity
