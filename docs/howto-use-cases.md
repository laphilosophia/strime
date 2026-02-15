# Real World Use Cases

Strime’s true power is revealed when it is positioned not just as a "JSON parser," but as a projection layer in high-volume data pipelines.

Below are several real-world use cases based on the engine's documented capabilities (not theoretical, but verified functionality).

### 1) SOC / SIEM Pre-filtering (Security Logs)
**Scenario**: Extracting only a few specific fields (e.g., `user`, `action`, `ip`, `status`) from massive security logs (auth, proxy, audit) before sending them to a downstream system.
**Why Strime**: Ideal for forward-only, streaming workloads with heavy skipping; it passes over unnecessary fields without materializing them.
**Example Schema**: `{ ts, actor { id }, action, src { ip }, status }`

This aligns perfectly with Strime's streaming/projection approach and NDJSON support.

### 2) Observability Pipeline "Cost-Cut" Projection
**Scenario**: Application telemetry events are massive, but a dashboard only needs 4-5 core fields.
**Why Strime**: Using a "filter during parse" model instead of "parse then filter" significantly reduces CPU and memory load.
**Example Schema**: `{ service, env, level, message, trace { id } }`

This approach leverages the "filter during parse" principle explained in the mental model.

### 3) Edge Function / API Gateway Lightweight Slicing
**Scenario**: Extracting fields from request/response bodies at the edge for routing or analytics.
**Why Strime**: Its forward-only, low-memory footprint is perfectly suited for latency-critical edge environments.
**Example Schema**: `{ requestId, user { id }, route, latencyMs }`

The lack of backtracking and forward-only movement provides a critical advantage here.

### 4) Fault-Tolerant NDJSON Ingestion (Dirty Data)
**Scenario**: Processing production logs that contain malformed rows without stopping the entire pipeline.
**Why Strime**: Supports `skipErrors`, `onError`, and `maxLineLength` to skip faulty lines and continue the stream.
**Example**: `ndjsonStream(stream, schema, { skipErrors: true, onError, maxLineLength })`

This feature is directly integrated into the adapter layer.

### 5) Real-time Callback-based Monitoring (Subscribe Model)
**Scenario**: Processing matches from a live stream via instant callbacks (for alerts, metric updates, or WebSocket fanout).
**Why Strime**: `subscribe()` operates in push-mode; matching data triggers immediate callbacks as the stream flows.
**Example Schema**: `{ deviceId, metrics { temp, cpu }, ts }`

This model is designed specifically for real-time and heavy-duty monitoring.

### 6) Zero-Copy Archiving / Side-Channel Recording (Raw Mode)
**Scenario**: Capturing matched JSON fragments as raw bytes (without objectification) to compress and store or forward to another stream.
**Why Strime**: `emitMode: 'raw'` and `onRawMatch` allow receiving raw byte streams, avoiding the overhead of object materialization.
**Example**: Forensic log storage, replay pipelines, data lineage channels.

This capability is explicitly available in the API.

### 7) Safe Stream Closure with Async Sinks (Drainable Output)
**Scenario**: Writing matches asynchronously to disk, S3, or a queue, and requiring a guaranteed flush/close at the end of the process.
**Why Strime**: The runtime layer collects pending promises and calls `onDrain` to ensure all output is finalized.
**Example**: "Extract → compress/write → drain"

This lifecycle behavior is a core part of the instance manager.

### 8) Multi-Query Workloads on Large Buffers (Indexed Mode)
**Scenario**: Different teams running multiple distinct projection queries against the same large JSON buffer.
**Why Strime**: For repeated queries, it can create a root-level index to jump directly to starting offsets.
**Note**: Indexed mode is supported for static buffers only and falls back to streaming for stream sources.

This behavior and its constraints are clearly documented.

### 9) Skip-Heavy Mega-File Scanning (Chunked Engine)
**Scenario**: Scanning a single massive buffer where selected fields are small but the fields to be skipped are very large.
**Why Strime**: `executeChunked()` provides byte-level skip optimizations that can significantly increase throughput.
**Example**: Forensic scanning, extracting specific fields from massive JSON dumps.

The performance documentation provides benchmarked results for this specific scenario.

### 10) Secure Multi-tenant Usage
**Scenario**: A SaaS layer processing user-provided JSON where "runaway" workloads must be capped.
**Why Strime**: `budget` (maxMatches, maxBytes, maxDurationMs) allows for deterministic cutting of expensive operations.
**Example**: Tenant-based SLAs and resource limits.

This security framework is documented in API options and capabilities.

---

## Where NOT to use Strime?
To use Strime effectively, it is important to respect its explicitly documented non-goals:

* **Aggregations**: (sum, count, group-by) are not Strime's responsibility.
* **Arbitrary Code**: There is no user-defined arbitrary code execution within the engine.
* **Global Rules**: No rules based on parent or global context.
* **Transformations**: No major reshaping or restructuring.

**The Philosophy**: Strime is a **projection layer**. By leaving aggregation and transformation to downstream systems, the overall architecture becomes much more scalable.
