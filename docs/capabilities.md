# JQL Capabilities

JQL is a projection engine with deliberately narrow scope. It selects and extracts fields from JSON documents without transforming, aggregating, or restructuring them. This document defines the operational boundaries—what JQL does, what it guarantees, and where its responsibility ends.

## Streaming Mode

Streaming mode is the default execution path and the one optimized for high-volume, forward-only data sources such as network streams, file handles, and NDJSON pipelines.

In streaming mode, the engine reads input bytes exactly once in sequence. It maintains a stack for depth tracking and a selection context for matching requested fields against the current path. When a match is found, the corresponding value is materialized and emitted. When a subtree falls outside the selection, the engine skips its bytes without constructing intermediate objects:

```ts
// src/core/engine.ts
private handleToken(token: Token) {
  if (this.skipDepth > 0) {
    // Fast-path: counting braces without materializing
    if (token.type === TokenType.LEFT_BRACE || token.type === TokenType.LEFT_BRACKET) {
      this.skipDepth++
    } else if (token.type === TokenType.RIGHT_BRACE || token.type === TokenType.RIGHT_BRACKET) {
      this.skipDepth--
      if (this.skipDepth === 0) {
        this.totalSkipTime += performance.now() - this.skipStartTime
        this.onStructureEnd(token.end)
      }
    }
    return  // Skip all other processing
  }
  // ... handle matched tokens
}
```

The guarantees in streaming mode are:

- **O(N) time complexity** where N is the byte count of the source.
- **O(D) memory complexity** where D is the maximum nesting depth.
- **Deterministic emit order** matching the byte order of the source document.
- **No backtracking**—the engine cannot revisit previously seen bytes.

## Indexed Mode

Indexed mode is available for static `Uint8Array` buffers and activates on repeat queries against the same buffer. On the first query, the engine processes the document normally. On subsequent queries, it builds a root-level key index:

```ts
// src/runtime/index.ts
function buildRootIndex(buffer: Uint8Array): Map<string, number> {
  const index = new Map<string, number>()
  const tokenizer = new Tokenizer()
  let depth = 0
  let currentKey: string | null = null

  for (const token of tokenizer.tokenize(buffer)) {
    if (token.type === TokenType.LEFT_BRACE || token.type === TokenType.LEFT_BRACKET) {
      depth++
    } else if (token.type === TokenType.RIGHT_BRACE || token.type === TokenType.RIGHT_BRACKET) {
      depth--
      if (depth === 0 && index.size > 0) break  // Early exit
    } else if (depth === 1 && token.type === TokenType.STRING && currentKey === null) {
      currentKey = token.value as string
    } else if (depth === 1 && token.type === TokenType.COLON && currentKey !== null) {
      index.set(currentKey, token.start)  // Record byte position
      currentKey = null
    }
  }
  return index
}
```

The index is ephemeral—tied to the buffer's identity and discarded when the JQL instance is garbage collected.

## Directive Constraints

Directives are terminal operators applied to matched values immediately before emission. They are constrained by design:

```ts
// src/core/directives.ts
DirectiveRegistry.register('substring', (val, args) => {
  if (typeof val !== 'string') return val
  const start = Math.max(0, args.start || 0)
  const len = Math.min(args.len || val.length, 10000)  // Capped at 10k chars
  return val.substring(start, start + len)
})

DirectiveRegistry.register('formatNumber', (val, args) => {
  if (typeof val !== 'number') return val
  const dec = Math.min(Math.max(0, args.dec || 2), 20)  // Capped at 20 decimals
  return Number(val.toFixed(dec))
})
```

These caps ensure that no directive can allocate unbounded memory or consume unbounded CPU time.

## Emission Modes

JQL supports two emission modes, selected at construction time to eliminate runtime branching:

```ts
// src/core/engine.ts
constructor(private initialSelection: SelectionMap, options?: { emitMode?: 'object' | 'raw' }) {
  // Set emit fast-path (ONE TIME - eliminates branch in hot path)
  if (this.emitMode === 'raw') {
    this.emitResult = (item, endPos) => this.emitRaw(item, endPos!)
  } else {
    this.emitResult = (item) => this.emitObject(item)
  }
}
```

- **Object mode** (default): Matched values are materialized as JavaScript objects.
- **Raw mode**: Matched values are emitted as `Uint8Array` byte ranges without materialization.

## Budget Enforcement

JQL supports resource budgets for DoS protection in multi-tenant or untrusted-input scenarios:

```ts
// src/core/engine.ts
private enforceBudget() {
  if (this.budget) {
    if (this.budget.maxMatches && this.matchedCount > this.budget.maxMatches) {
      throw new BudgetExhaustedError(`Match limit exceeded: ${this.budget.maxMatches}`, 'MATCHES')
    }
    if (this.budget.maxBytes && this.processedBytes > this.budget.maxBytes) {
      throw new BudgetExhaustedError(`Byte limit exceeded: ${this.budget.maxBytes}`, 'BYTES')
    }
    if (this.budget.maxDurationMs && performance.now() - this.startTime > this.budget.maxDurationMs) {
      throw new BudgetExhaustedError(`Duration limit exceeded: ${this.budget.maxDurationMs}ms`, 'DURATION')
    }
  }
}
```

Budgets can limit match count, byte throughput, or execution duration—whichever is reached first triggers a controlled abort.

---

The boundaries described here are not incidental limitations—they are load-bearing constraints that enable the performance guarantees documented in [Performance Contract](performance.md). Features that would require crossing these boundaries belong to a different class of tools.
