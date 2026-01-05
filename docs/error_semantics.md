# JQL Error Semantics & API Contract

This document defines how JQL handles malformed data, schema mismatches, and execution failures.

## 1. Failure Categories

| Category | Behavior | Result |
| :--- | :--- | :--- |
| **Syntax Error (JQL)** | **Hard Abort** | Throws `Error` during `parse()`. |
| **Malformed JSON (Structural)** | **Resilient Skip** | Skips invalid tokens and attempts to sync on next `{`, `}`, `[`, `]`. |
| **Corrupted Token (Literal)** | **Hard Abort** | Throws `Error` (e.g., `truX` instead of `true`). Prevents state sync loss. |
| **Schema Mismatch** | **Silent Drop** | Requested key not found in JSON → key omitted or `@default`. |
| **Directive Error** | **Safe Fallback** | `null` or un-transformed value (see below). |

## 2. Directive Failure Modes

Directives are designed to be "best-effort" unless strict mode is enabled.

- **`@coerce`**: If type casting fails (e.g., `"abc"` to number), it returns the original value or `null` depending on implementation.
- **`@default`**: Only triggered if the key is entirely missing or explicitly `null` in source.
- **`@substring`**: If offsets are out of bounds, it returns an empty string or the clamped string.

## 3. Streaming Interruptions

- JQL processes data in chunks. If the stream closes early, the engine returns a **Result Snapshot** of what it managed to materialize before the EOF, provided the JSON structure up to that point was valid.

---

## 4. Error Table

| Error Type | Default Action | Configurable? |
| :--- | :--- | :--- |
| Invalid JSON Syntax | Throw | No |
| Undefined Directive | ignore | No |
| Missing Path | Skip/Ignore | Yes (via `@default`) |
| Buffer Overflow | Throw | No |
