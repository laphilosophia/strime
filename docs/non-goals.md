# JQL Non-Goals

This document describes features that are intentionally excluded from JQL's scope. These are not missing features awaiting implementation—they are deliberate design boundaries that preserve the engine's core guarantees.

## Data Aggregation

JQL does not compute aggregates such as sums, averages, counts, or group-by operations.

Aggregation requires accumulating state across multiple values and emitting a result only after all relevant data has been seen. This conflicts fundamentally with the forward-only streaming model. An aggregation like "sum of all prices" cannot be computed incrementally without retaining all prices in memory or making a second pass—both of which violate JQL's memory and time guarantees.

If you need aggregation, the intended pattern is to use JQL for extraction and pipe the results to a purpose-built aggregation tool. JQL handles the projection; something else handles the math.

## User-Defined Code

JQL does not execute user-provided functions during traversal.

Allowing callbacks or custom logic inside the engine introduces unpredictable latency, potential infinite loops, and runtime errors that cannot be bounded. The engine's performance model depends on knowing exactly what operations will occur for each token. User code breaks that predictability.

Directives are the extension point, but even directives are constrained to O(1) operations with bounded allocation. There is no mechanism for injecting arbitrary computation.

## Parent and Global Context

JQL directives cannot access parent nodes, root values, or sibling fields.

A directive like `@formatCurrency` that needs the document's `locale` field to determine formatting would require either retaining the entire document or making a second pass to resolve references. Forward-only traversal means the parent is gone by the time the child is reached.

Patterns that require parent context—"include this field only if the parent's type is X"—belong to post-processing logic, not the projection engine.

## Schema Transformation

JQL projects fields from source to output. It does not restructure documents.

Operations like "flatten this nested object into a list" or "merge these two fields into one" require constructing new shapes that do not exist in the source. JQL's output shape mirrors the source shape, filtered to the requested fields. If you need structural transformation, apply it after JQL extracts the relevant data.

## Persistent Indexing

JQL indexes are ephemeral and memory-bound.

The optional indexed mode builds a lightweight key-position map for `Uint8Array` buffers, but this index exists only in memory and is discarded when the instance is garbage collected. There is no disk-based indexing, no index persistence across process restarts, and no shared index between instances.

Persistent indexing would require a storage layer, serialization format, and invalidation strategy—concerns that belong to a database, not a streaming projection engine.

---

These boundaries exist because crossing them would compromise the guarantees that make JQL useful. A projection engine that also aggregates, transforms, and indexes is no longer a projection engine—it's trying to be a database. JQL stays small so it can stay fast.
