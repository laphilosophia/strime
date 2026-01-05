/**
 * Compression Sink - Streaming compression with worker pool
 *
 * Features:
 * - Non-blocking compression via worker pool
 * - Backpressure handling
 * - Stats tracking (compression ratio, throughput)
 * - Both Node.js and Web Streams support
 */

import { Writable } from 'node:stream'
import { OutputSink } from '../core/sink'
import { WorkerPool } from '../workers/worker-pool'

export interface CompressionSinkOptions {
  /**
   * Compression algorithm
   */
  algorithm: 'gzip' | 'brotli'

  /**
   * Compression level
   * - gzip: 1-9 (default: 6)
   * - brotli: 0-11 (default: 4)
   */
  level?: number

  /**
   * Number of compression workers (default: 2)
   */
  workers?: number

  /**
   * Output stream (Node.js or Web Stream)
   */
  output: Writable | WritableStream<Uint8Array>

  /**
   * Stats callback
   */
  onStats?: (stats: CompressionStats) => void
}

export interface CompressionStats {
  bytesIn: number
  bytesOut: number
  compressionRatio: number
  throughputMbps: number
  chunksProcessed: number
}

export function createCompressionSink(options: CompressionSinkOptions): OutputSink {
  const { algorithm, level = algorithm === 'gzip' ? 6 : 4, workers = 2, output, onStats } = options

  // Create worker pool
  const pool = new WorkerPool({
    size: workers,
    scriptPath: '../workers/compression-worker.ts',
  })

  // Stats tracking
  let bytesIn = 0
  let bytesOut = 0
  let chunksProcessed = 0
  const startTime = performance.now()

  // Pending chunks (for ordering)
  const pendingChunks = new Map<number, Uint8Array>()
  let nextExpectedId = 0
  let sequenceId = 0

  // Output writer
  const writer = isNodeStream(output)
    ? createNodeStreamWriter(output as Writable)
    : (output as WritableStream<Uint8Array>).getWriter()

  // Compression function
  async function compressChunk(chunk: Uint8Array): Promise<void> {
    const id = sequenceId++
    bytesIn += chunk.length

    try {
      const response = await pool.execute<{
        id: number
        compressed?: Uint8Array
        error?: string
      }>({
        id,
        data: chunk,
        algorithm,
        level,
      })

      if (response.error) {
        throw new Error(response.error)
      }

      const compressed = response.compressed!
      bytesOut += compressed.length
      chunksProcessed++

      // Buffer for ordering
      pendingChunks.set(id, compressed)

      // Try to emit in order
      await tryEmitInOrder()

      // Emit stats
      if (onStats) {
        const duration = performance.now() - startTime
        onStats({
          bytesIn,
          bytesOut,
          compressionRatio: bytesIn / Math.max(1, bytesOut),
          throughputMbps: (bytesIn * 8) / (duration * 1000),
          chunksProcessed,
        })
      }
    } catch (error) {
      throw error
    }
  }

  async function tryEmitInOrder(): Promise<void> {
    while (pendingChunks.has(nextExpectedId)) {
      const chunk = pendingChunks.get(nextExpectedId)!
      pendingChunks.delete(nextExpectedId)

      // Write to output
      if (isNodeStream(output)) {
        await writeToNodeStream(writer as NodeStreamWriter, chunk)
      } else {
        await (writer as WritableStreamDefaultWriter<Uint8Array>).write(chunk)
      }

      nextExpectedId++
    }
  }

  async function flush(): Promise<void> {
    // Wait for all pending chunks
    while (pendingChunks.size > 0) {
      await tryEmitInOrder()
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    // Close output
    if (isNodeStream(output)) {
      await closeNodeStream(writer as NodeStreamWriter)
    } else {
      await (writer as WritableStreamDefaultWriter<Uint8Array>).close()
    }

    // Terminate workers
    await pool.terminate()
  }

  return {
    onRawMatch: async (chunk: Uint8Array) => {
      await compressChunk(chunk)
    },
    onDrain: async () => {
      await flush()
    },
  }
}

// Helper: Check if Node.js stream
function isNodeStream(stream: any): stream is Writable {
  return stream && typeof stream.write === 'function' && typeof stream.end === 'function'
}

// Helper: Node.js stream writer
interface NodeStreamWriter {
  write: (chunk: Uint8Array) => Promise<void>
  close: () => Promise<void>
}

function createNodeStreamWriter(stream: Writable): NodeStreamWriter {
  return {
    write: (chunk: Uint8Array) =>
      new Promise((resolve, reject) => {
        const canContinue = stream.write(chunk)
        if (canContinue) {
          resolve()
        } else {
          stream.once('drain', resolve)
          stream.once('error', reject)
        }
      }),
    close: () =>
      new Promise((resolve, reject) => {
        stream.end((err?: Error) => {
          if (err) reject(err)
          else resolve()
        })
      }),
  }
}

async function writeToNodeStream(writer: NodeStreamWriter, chunk: Uint8Array): Promise<void> {
  await writer.write(chunk)
}

async function closeNodeStream(writer: NodeStreamWriter): Promise<void> {
  await writer.close()
}
