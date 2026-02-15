# Deployment Matrix

| Use-case                                                  | Recommended Entry Point                              | Example Schema                        | Critical Options                                            | Rationale                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **High-volume single JSON query** (batch file)            | `query(...)` / low-level `Engine.execute`            | `{ id, user { name }, status }`       | `budget` (maxBytes/maxDuration), `onStats`                  | O(N) time / O(D) space and filtering during projection.                          |
| **Skip-heavy large buffer** (skipping many fields)        | `Engine.executeChunked(buffer, 64KB)`                | `{ wantedField, meta { key } }`       | chunkSize: 32–64KB, `budget`                                | Significant throughput boost via chunked skip; byte-level skip is most efficient. |
| **NDJSON ingestion (clean data)**                         | `ndjsonStream(stream, schema)`                       | `{ ts, level, message }`              | `signal`, `budget`                                          | Row-by-row projection from stream; streaming-first model.                        |
| **NDJSON ingestion (dirty data / prod logs)**             | `ndjsonStream(stream, schema, { skipErrors: true })` | `{ id, event, source }`               | `skipErrors`, `onError`, `maxLineLength`                    | Skips malformed rows; line length limit prevents DoS.                            |
| **Real-time monitoring / alerting**                       | `subscribe(stream, schema, { onMatch })`             | `{ deviceId, metrics { temp }, ts }`  | `onMatch`, `onError`, `signal`, `budget`                    | Push-mode callback flow; designed for real-time telemetry.                       |
| **Repeated different queries on the same buffer**         | `build(source, { mode: 'indexed' }).read(schema)`    | Query 1: `{ a }`, Query 2: `{ b,c }` | `mode: 'indexed'` (static buffer only)                      | Fast repeat queries via root-key index; indexed mode not supported for streams.  |
| **Zero-copy side channel / replay / archive**             | `emitMode: 'raw'` + `sink.onRawMatch`                | `{ payload { id } }`                  | `emitMode: 'raw'`, `onRawMatch`, optional compression sink | Captures matched data as bytes, reducing object materialization overhead.        |
| **Safe shutdown with async output (IO/compression)**      | `build(..., { sink })`                               | any                                   | `sink.onMatch/onRawMatch`, `sink.onDrain`                   | Runtime layer collects and drains async sink promises.                           |

## When NOT to use Strime

* If you need aggregation/group-by/sum (perform these in a downstream layer).
* If you need schema reshaping/merging/flattening (use a post-processing pipeline).
* If you expect arbitrary user code execution inside the engine (kept out of scope for predictability).

## Recommended Rollout Path (Practical)

* **MVP**: `ndjsonStream` + `skipErrors` + `maxLineLength` + `budget` (safe ingestion).
* **Performance**: Switch to `executeChunked` for skip-heavy workloads.
* **Realtime**: Use `subscribe` for live-wire monitoring with the same schemas.
* **Repeat Query Workloads**: Try `indexed` mode for static payloads.
* **IO Optimization**: Professionalize output with `raw` emission + `sink/drain`.
