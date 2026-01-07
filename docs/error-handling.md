# Strime Error Handling

Strime distinguishes between recoverable conditions and fatal errors. This distinction matters because Strime is designed for streaming contexts where partial results may still be valuable. The error model is explicit: every error type has a defined behavior, and the caller knows what to expect.

## Error Hierarchy

All Strime errors extend a common base class that provides structured error information:

```ts
// src/core/errors.ts
export class StrimeError extends Error {
  constructor(
    message: string,
    public readonly code: string,      // Machine-readable code
    public readonly position?: number, // Byte offset
    public line?: number               // Line number (NDJSON)
  ) {
    super(message)
    this.name = 'StrimeError'
  }
}
```

### Error Types

| Error Class | Code | Behavior | Recoverable |
|-------------|------|----------|-------------|
| `TokenizationError` | `TOKENIZATION_ERROR` | Invalid JSON syntax encountered | No |
| `ParseError` | `PARSE_ERROR` | Invalid Strime query syntax | No |
| `StructuralMismatchError` | `STRUCTURAL_MISMATCH` | JSON structure doesn't match expectation | No |
| `AbortError` | `ABORTED` | Operation cancelled via AbortSignal | Controlled |
| `BudgetExhaustedError` | `BUDGET_EXHAUSTED_*` | Execution limit reached | Controlled |

## Failure Categories

### Fatal Errors

These errors terminate processing immediately:

**Tokenization Errors**: Invalid JSON syntax such as unquoted keys, trailing commas, or malformed literals.

```ts
// Thrown when: {"key": truX}
throw new TokenizationError("Invalid literal: expected 'true', got 'truX'", position)
```

**Parse Errors**: Invalid Strime query syntax.

```ts
// Thrown when query is: { name @unknownDirective }
throw new ParseError("Expected identifier at 15", position)
```

### Controlled Termination

These are not errors in the failure sense—they indicate intentional halts:

**Abort Errors**: Triggered by an `AbortSignal`. Useful for cancelling long-running operations.

**Budget Exhaustion**: Triggered when execution limits are reached. Output up to the last completed emission remains valid.

```ts
// src/core/engine.ts
if (this.budget.maxMatches && this.matchedCount > this.budget.maxMatches) {
  throw new BudgetExhaustedError(`Match limit exceeded: ${this.budget.maxMatches}`, 'MATCHES')
}
```

### Silent Conditions

These conditions do not throw errors:

**Missing Fields**: If a requested field is absent, it is omitted from output unless `@default` is specified.

**Type Mismatches in Directives**: If a directive receives an incompatible type (e.g., `@substring` on a number), it returns the original value unchanged.

## NDJSON Error Handling

The NDJSON adapter provides fault-tolerant processing for line-delimited streams:

```ts
// src/adapters/ndjson.ts
for await (const row of ndjsonStream(stream, '{ id, name }', {
  skipErrors: true,
  onError: (info) => {
    console.error(`Line ${info.lineNumber}: ${info.error.message}`)
  },
  maxLineLength: 1024 * 1024  // DoS protection
})) {
  // Process valid rows
}
```

With `skipErrors: true`, malformed lines are reported via `onError` and skipped. Processing continues with the next line. With `skipErrors: false` (default), the first error terminates the stream.

## Usage Patterns

### Catching Specific Errors

```ts
import { query, TokenizationError, StructuralMismatchError } from 'strime'

try {
  const result = await query(data, schema)
} catch (error) {
  if (error instanceof TokenizationError) {
    console.error(`Invalid JSON at byte ${error.position}`)
  } else if (error instanceof StructuralMismatchError) {
    console.error(`Unexpected structure: ${error.message}`)
  }
}
```

### Budget-Limited Execution

```ts
import { query, BudgetExhaustedError } from 'strime'

try {
  const result = await query(stream, '{ id }', {
    budget: { maxMatches: 1000, maxDurationMs: 5000 }
  })
} catch (error) {
  if (error instanceof BudgetExhaustedError) {
    console.log(`Stopped at limit: ${error.limitType}`)
    // Partial results already emitted via onMatch
  }
}
```

---

For streaming semantics, see [Capabilities](capabilities.md). For NDJSON processing, see [Quick Start](quick-start.md).
