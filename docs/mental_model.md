# Strime Mental Model

Strime exists because conventional JSON parsers assume you want everything. They convert the entire input into an object graph, even when your application needs only a handful of fields. This is wasteful in contexts where data volume is high and latency budgets are tight—log aggregation, telemetry pipelines, edge functions. Strime takes a different path: it treats JSON as a structured byte stream, not a data structure waiting to be born.

The fundamental insight is that most of the work a parser does is unnecessary if you already know what you're looking for. Strime inverts the relationship between parsing and querying. Instead of parsing first and filtering later, it filters during the parse itself, skipping byte ranges that fall outside the requested projection. The consequence is that the cost of processing a document becomes proportional to the size of the selected data, not the total payload.

## Bytes Over Objects

Traditional JSON processing follows a well-understood pipeline: bytes are decoded into strings, strings are tokenized, tokens are parsed into an abstract syntax tree, and the tree is materialized into language-native objects. Each stage allocates memory and consumes CPU cycles regardless of whether the resulting objects are ever used. Strime collapses this pipeline by avoiding materialization until confirmation of a match. The engine traverses tokens without constructing intermediate representations, and only when a requested field is located does it decode the corresponding byte range into a value.

This design has a specific implication: Strime can process arbitrarily large documents without memory growth proportional to document size. Memory usage scales with nesting depth and the size of selected values—not with the size of ignored subtrees.

## Forward-Only Traversal

Strime is a forward-only engine. It reads bytes in sequence, maintains a minimal stack for depth tracking, and emits results as they are discovered. There is no backtracking, no parent-context access, no second pass. This constraint is deliberate—it preserves the ability to process infinite streams (such as NDJSON from a network socket) without buffering the entire input.

The forward-only model shapes what Strime can and cannot do. Features that require revisiting previously seen data—aggregations, cross-references, sorting—are excluded by design. These are not missing features; they are explicit non-goals that preserve the streaming guarantee.

## Streaming vs Indexed Mode

Strime offers two execution modes, each suited to different access patterns.

In streaming mode, the engine reads the source once and emits results incrementally. This is the default and the mode that preserves constant memory overhead. It is ideal for processing large files, real-time log streams, or data arriving over a network connection.

In indexed mode, available only for static buffers, Strime builds a lightweight index of root-level key positions on repeat queries. Subsequent queries can then skip directly to requested keys rather than scanning from the beginning. The index is ephemeral—tied to the buffer's identity and discarded when the instance is garbage collected. This mode trades a small indexing cost on the first pass for faster access on subsequent passes, making it suitable for scenarios where the same buffer is queried multiple times with different projections.

## Directives as Filters

Directives in Strime—`@default`, `@substring`, `@formatNumber`, and similar—are not transformation operators in the general sense. They are designed as terminal filters that operate on the immediate value as it is about to leave the engine. They cannot look backward at parent nodes, cannot reference sibling fields, and cannot accumulate state across the document.

This restriction is load-bearing. It ensures directives remain O(1) operations relative to the node they touch, preventing any single directive from undermining the linear-time guarantee of the overall traversal.

---

References:

- Streaming data processing patterns in edge systems
- SAX parsers and forward-only XML processing models
