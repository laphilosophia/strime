# JQL Internals: How it's so fast 🏎️

JQL V2.2.0 reaches sub-5s performance for 1M rows through hardware-aligned engineering. This document explains the "Magic" under the hood.

## 1. GC-Free Steady State ♻️

Standard JSON parsers create millions of temporary objects (tokens, keys, values) which trigger frequent "Stop-the-world" Garbage Collection pauses.

**JQL's Solution**:

- **Tokenizer Buffering**: We use a single, pre-allocated `64KB Uint8Array` for all token accumulation.
- **Token Recycling**: A single `reusableToken` object is mutated and passed to the callback. No new objects are allocated per token.
- **Zero GC**: Once the engine starts, the heap memory remains perfectly flat.

## 2. Binary Line Splitting (The NDJSON Shortcut) 🏎️

NDJSON processing often involves: `Chunk (Byte) -> Decode (String) -> Split (String[]) -> Encode (Byte) -> Parser`.

**JQL's Solution**:

- We perform linear scans for the `newline (10)` byte directly on the `Uint8Array`.
- No strings are created for the line itself.
- The line is passed as a `subarray` view to the engine, avoiding memory copies.

## 3. Integer Fast-Paths 🔢

`parseFloat()` and `Number()` are heavy.

**JQL's Solution**:

- We implement a custom, linear-time integer parser that operates directly on bytes.
- If a token is a simple integer (no `.` or `e`), we bypass the JS engine's heavy parsing logic entirely.

## 4. Token Caching 💎

JSON logs repeat keys like `"id"`, `"timestamp"`, and `"level"` millions of times.

**JQL's Solution**:

- JQL maintains a small, fixed-size cache of recently decoded strings (under 32 bytes).
- If a byte sequence matches a cached key, we return the cached string reference instead of calling `TextDecoder.decode()`.

## 5. Why not Uint32/SWAR? 🧪

We experimented with wide-reads (Uint32/SWAR) to leapfrog 4 bytes at a time. While micro-benchmarks showed a 50%+ gain, real-world JSON is so dense with structural characters that the overhead of alignment checks and bitmasking was a net negative.

**V8's native `Uint8Array` loop vectorization is a beast**, and JQL is designed to play to its strengths.

## 6. Forward-Only FSM 📡

JQL never backtracks. It maintains a stack-based State Machine that processes data in a single pass. This ensures $O(N)$ time complexity and $O(D)$ memory complexity, where $D$ is the nesting depth.
