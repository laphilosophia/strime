/**
 * Ordering Gate - Ensures correct ordering of parallel results
 *
 * Modes:
 * - relaxed: Emit results as they arrive (max throughput)
 * - preserve: Emit results in original order (deterministic)
 */

export type OrderingMode = 'preserve' | 'relaxed'

export class OrderingGate<T> {
  private buffer = new Map<number, T>()
  private nextExpectedId = 0
  private maxBufferSize: number
  private emitCallback: (data: T) => void

  constructor(
    private mode: OrderingMode,
    workers: number,
    emitCallback: (data: T) => void
  ) {
    this.maxBufferSize = workers * 2
    this.emitCallback = emitCallback
  }

  /**
   * Wait if buffer is full (backpressure)
   */
  async waitIfFull(): Promise<void> {
    while (this.buffer.size >= this.maxBufferSize) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1))
    }
  }

  /**
   * Push a result from a worker
   */
  push(id: number, data: T) {
    if (this.mode === 'relaxed') {
      // Emit immediately
      this.emitCallback(data)
    } else {
      // Buffer and try to emit in order
      this.buffer.set(id, data)
      this.tryEmitInOrder()
    }
  }

  /**
   * Try to emit buffered results in order
   */
  private tryEmitInOrder() {
    while (this.buffer.has(this.nextExpectedId)) {
      const data = this.buffer.get(this.nextExpectedId)!
      this.buffer.delete(this.nextExpectedId)
      this.emitCallback(data)
      this.nextExpectedId++
    }
  }

  /**
   * Drain remaining buffered results
   */
  async drain(): Promise<void> {
    if (this.mode === 'preserve') {
      // Wait for all results to arrive
      while (this.buffer.size > 0) {
        this.tryEmitInOrder()
        await new Promise<void>((resolve) => setTimeout(resolve, 1))
      }
    }
  }

  get bufferSize(): number {
    return this.buffer.size
  }

  get isFull(): boolean {
    return this.buffer.size >= this.maxBufferSize
  }
}
