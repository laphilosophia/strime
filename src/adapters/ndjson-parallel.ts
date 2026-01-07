/**
 * NDJSON Parallel Adapter
 *
 * Provides opt-in parallel processing for NDJSON streams.
 *
 * Architecture:
 * - Line splitting (main thread, cache-friendly)
 * - Worker pool (bounded)
 * - Ordering gate (preserve | relaxed)
 * - Backpressure handling
 */

import { WorkerPool } from '../workers/worker-pool'
import { OrderingGate, OrderingMode } from './ordering-gate'

interface WorkerResponse {
  id: number
  result?: any
  raw?: Uint8Array
  error?: string
}

export interface NDJSONParallelOptions {
  /**
   * Enable parallel processing (default: false)
   */
  parallel?: boolean

  /**
   * Number of worker threads (default: 4)
   */
  workers?: number

  /**
   * Result ordering mode (default: 'preserve')
   * - preserve: Maintain original line order (deterministic)
   * - relaxed: Emit results as they arrive (max throughput)
   */
  ordering?: OrderingMode

  /**
   * Maximum line length in bytes (default: 10MB)
   * DoS protection
   */
  maxLineLength?: number

  /**
   * Emit mode (default: 'object')
   */
  emitMode?: 'object' | 'raw'
}

/**
 * Process NDJSON stream with optional parallelization
 */
export async function* ndjsonParallel(
  stream: ReadableStream<Uint8Array>,
  query: string,
  options: NDJSONParallelOptions = {}
): AsyncGenerator<any> {
  const {
    parallel = false,
    workers = 4,
    ordering = 'preserve',
    maxLineLength = 10 * 1024 * 1024, // 10MB
    emitMode = 'object',
  } = options

  // If parallel is disabled, fall back to serial processing
  if (!parallel) {
    yield* ndjsonSerial(stream, query, { maxLineLength, emitMode })
    return
  }

  // Create worker pool
  const pool = new WorkerPool({
    size: workers,
    scriptPath: '../workers/ndjson-worker.ts',
  })

  // Results queue
  const results: any[] = []
  let resultResolve: null | (() => void) = null

  // Create ordering gate
  const gate = new OrderingGate<any>(ordering, workers, (data) => {
    results.push(data)
    const resolve = resultResolve
    if (resolve !== null) {
      resolve()
      resultResolve = null
    }
  })

  // Process lines
  let sequenceId = 0
  let processingComplete = false
  let processingError: Error | null = null

  // Start processing in background
  ;(async () => {
    try {
      for await (const line of splitLines(stream, maxLineLength)) {
        const id = sequenceId++

        // Backpressure: wait if gate is full
        await gate.waitIfFull()

        // Dispatch to worker
        pool
          .execute<WorkerResponse>({
            id,
            line,
            query,
            emitMode,
          })
          .then((response) => {
            if (response.error) {
              throw new Error(response.error)
            }
            const data = emitMode === 'raw' ? response.raw : response.result
            gate.push(id, data)
          })
          .catch((error) => {
            processingError = error
          })
      }

      // Wait for all workers to complete
      await gate.drain()
      processingComplete = true

      // Wake up consumer
      if (resultResolve) {
        ;(resultResolve as () => void)()
      }
    } catch (error) {
      processingError = error instanceof Error ? error : new Error(String(error))
    } finally {
      await pool.terminate()
    }
  })()

  // Yield results as they become available
  while (!processingComplete || results.length > 0) {
    if (processingError) {
      throw processingError
    }

    if (results.length > 0) {
      yield results.shift()
    } else if (!processingComplete) {
      // Wait for next result
      await new Promise<void>((resolve) => {
        resultResolve = resolve
      })
    }
  }
}

/**
 * Serial NDJSON processing (fallback)
 */
async function* ndjsonSerial(
  stream: ReadableStream<Uint8Array>,
  query: string,
  options: { maxLineLength: number; emitMode: 'object' | 'raw' }
): AsyncGenerator<any> {
  const { StrimeParser } = await import('../core/parser')
  const { Engine } = await import('../core/engine')

  const parser = new StrimeParser(query)
  const map = parser.parse()

  for await (const line of splitLines(stream, options.maxLineLength)) {
    let result: any
    let raw: Uint8Array | undefined

    const engine = new Engine(map, {
      emitMode: options.emitMode,
      sink:
        options.emitMode === 'raw'
          ? {
              onRawMatch: (chunk) => {
                raw = chunk
              },
            }
          : {
              onMatch: (data) => {
                result = data
              },
            },
    })

    engine.execute(line)

    yield options.emitMode === 'raw' ? raw : result
  }
}

/**
 * Split NDJSON stream into lines
 */
async function* splitLines(
  stream: ReadableStream<Uint8Array>,
  maxLineLength: number
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader()
  let buffer = new Uint8Array(0)

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (value) {
        // Append to buffer
        const newBuffer = new Uint8Array(buffer.length + value.length)
        newBuffer.set(buffer)
        newBuffer.set(value, buffer.length)
        buffer = newBuffer
      }

      // Find line breaks
      let start = 0
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === 0x0a) {
          // \n
          const line = buffer.subarray(start, i)

          // Skip empty lines
          if (line.length > 0) {
            // Check max length
            if (line.length > maxLineLength) {
              throw new Error(`Line exceeds maximum length (${line.length} > ${maxLineLength})`)
            }

            yield line
          }

          start = i + 1
        }
      }

      // Keep remaining bytes
      buffer = buffer.subarray(start)

      if (done) {
        // Yield final line if present
        if (buffer.length > 0) {
          if (buffer.length > maxLineLength) {
            throw new Error(`Line exceeds maximum length (${buffer.length} > ${maxLineLength})`)
          }
          yield buffer
        }
        break
      }
    }
  } finally {
    reader.releaseLock()
  }
}
