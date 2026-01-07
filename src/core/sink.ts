/**
 * Performance metrics for a Strime execution.
 */
export interface StrimeStats {
  matchedCount: number
  processedBytes: number
  durationMs: number
  throughputMbps: number
  skipRatio: number
}

/**
 * Interface for Strime output delivery.
 * Decouples the engine from specific emission formats or targets.
 *
 * Callbacks may return Promises for async operations (e.g., compression, I/O).
 * The engine does NOT await these promises - backpressure is handled at the runtime layer.
 */
export interface OutputSink {
  /**
   * Called when a new projected object/value is ready.
   * May return a Promise for async processing (e.g., writing to disk).
   */
  onMatch?(data: any): void | Promise<void>

  /**
   * Called when raw source bytes for a match are requested (emitRaw mode).
   * May return a Promise for async processing (e.g., compression).
   */
  onRawMatch?(chunk: Uint8Array): void | Promise<void>

  /**
   * Called periodically or at completion with performance metrics.
   */
  onStats?(stats: StrimeStats): void

  /**
   * Called when the stream is complete and all data has been emitted.
   * Used for graceful shutdown, flushing buffers, closing files, etc.
   *
   * Runtime adapters should call this after all processing is complete.
   * Core engine does NOT call this - it's a runtime-layer concern.
   */
  onDrain?(): Promise<void>
}
