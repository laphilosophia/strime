# Strime Internals

Strime achieves its performance characteristics not through algorithmic novelty but through disciplined engineering choices that align with how modern JavaScript runtimes optimize execution. The techniques described here are individually well-known; the contribution is in their consistent application to a JSON projection engine.

## Allocation Discipline

The primary bottleneck in high-throughput JSON processing is not CPU cycles but garbage collection. Traditional parsers allocate objects for every token, key, and value—millions of small objects that trigger frequent GC pauses. Strime's tokenizer is designed to reach a steady state where the hot loop allocates nothing.

The tokenizer maintains a single 64KB `Uint8Array` buffer for accumulating string and number bytes during tokenization. When a token is complete, its value is decoded and the buffer offset resets—the array itself is never reallocated. A single `reusableToken` object is mutated and passed to the callback rather than constructing a new token object per emission.

```ts
// src/core/tokenizer.ts
export class Tokenizer {
  private buffer = new Uint8Array(65536)  // Single pre-allocated buffer
  private bufferOffset = 0
  private reusableToken: Token = { type: TokenType.NULL, start: 0, end: 0 }
  // ...

  private emit(type: TokenType, start: number, end: number, onToken: (t: Token) => void, value?: unknown): void {
    this.reusableToken.type = type
    this.reusableToken.start = start
    this.reusableToken.end = end
    this.reusableToken.value = value
    onToken(this.reusableToken)  // Same object reference, mutated in place
  }
}
```

The caller receives the same object reference repeatedly; if persistence is needed, the caller must clone. This pattern has a consequence: the heap profile of Strime during sustained processing appears flat.

## String Interning

JSON documents in log and telemetry contexts exhibit high key repetition. A stream of ten million log entries may contain the same `"timestamp"`, `"level"`, and `"message"` keys repeated verbatim. Decoding these strings ten million times via `TextDecoder` is wasteful.

The tokenizer maintains a small string cache for strings shorter than 32 bytes, holding up to 500 entries:

```ts
// src/core/tokenizer.ts
private stringCache = new Map<string, string>()
// ...

private decodeBuffer(): string {
  const len = this.bufferOffset
  if (len === 0) return ''
  if (len < 32) {
    let cacheKey = ''
    for (let i = 0; i < len; i++) {
      cacheKey += String.fromCharCode(this.buffer[i])
    }
    const cached = this.stringCache.get(cacheKey)
    if (cached !== undefined) return cached
    if (this.stringCache.size < 500) {
      this.stringCache.set(cacheKey, cacheKey)
    }
    return cacheKey
  }
  return this.decoder.decode(this.buffer.subarray(0, len))
}
```

The 32-byte threshold ensures that only short, frequently repeated keys are cached. The 500-entry limit prevents unbounded memory growth from high-cardinality fields.

## Integer Fast Path

Numeric parsing in JavaScript typically involves `parseFloat()` or the `Number()` constructor, both of which handle the full JSON number grammar including decimals, exponents, and signs. For the common case of simple positive integers, this generality is overhead.

```ts
// src/core/tokenizer.ts
private parseNumber(): number {
  const len = this.bufferOffset
  // Fast path for positive integers
  let res = 0
  let isSimple = true
  for (let i = 0; i < len; i++) {
    const b = this.buffer[i]
    if (b >= 48 && b <= 57) {          // ASCII 0-9
      res = res * 10 + (b - 48)        // Shift-and-add accumulation
    } else {
      isSimple = false
      break
    }
  }
  if (isSimple) return res
  return parseFloat(this.decoder.decode(this.buffer.subarray(0, len)))  // Fallback
}
```

If a non-digit character is encountered (decimal point, exponent marker, negative sign), the fast path aborts and falls back to `parseFloat()`.

## Binary Line Splitting

The NDJSON adapter processes streams of newline-delimited JSON objects. A naive implementation would decode the byte stream to a string, split on newlines, re-encode each line to bytes, and pass to the parser. Strime operates entirely on `Uint8Array` chunks:

```ts
// src/adapters/ndjson.ts
while (start < chunk.length) {
  const newlineIndex = chunk.indexOf(10, start)  // 10 is \n in ASCII

  if (newlineIndex === -1) {
    leftover = chunk.slice(start)  // Save incomplete line for next chunk
    break
  }

  const line = chunk.subarray(start, newlineIndex)  // Zero-copy view
  // ...
  engine.reset()
  const result = engine.execute(line)
  yield result

  start = newlineIndex + 1
}
```

No strings are created for the line content itself—decoding happens only for matched field values during projection. The engine is recycled between lines via `reset()` without reallocating buffers.

## Forward-Only State Machine

The engine maintains a stack-based finite state machine that tracks the current position in the JSON structure. This state machine moves strictly forward—each byte advances the position, and no operation requires revisiting earlier bytes.

The consequence is that time complexity is O(N) where N is the byte count, and memory complexity is O(D) where D is the maximum nesting depth. A 10GB file with shallow nesting uses the same memory baseline as a 10KB file with the same structure.

## What Is Not Optimized

Strime does not use SIMD intrinsics or wide-register tricks (SWAR). Experiments with `Uint32Array` reads for parallel byte scanning showed modest gains in micro-benchmarks but net regressions in real-world JSON due to the overhead of alignment checks and bitmask operations. V8's native loop vectorization on `Uint8Array` iteration—where the access pattern is simple and predictable—proved more effective than manual SIMD emulation.

Strime also does not implement structural indexing beyond the optional root-key offset map. Deep indexing strategies that would allow arbitrary path random-access conflict with the streaming model and are excluded by design.

---

References:

- V8 engine optimization patterns for TypedArray operations
- NDJSON specification and streaming processing patterns
