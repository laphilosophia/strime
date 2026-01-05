import { Writable } from 'node:stream'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { createCompressionSink } from '../sinks/compression-sink'

/**
 * Compression Sink Tests
 *
 * Note: Similar to parallel tests, compression workers require
 * compiled .js files in production. These tests validate the API
 * and basic functionality in development.
 */

describe('Compression Sink', () => {
  // Helper to create in-memory writable stream
  function createMemoryStream(): { stream: Writable; getBuffer: () => Buffer } {
    const chunks: Buffer[] = []

    const stream = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(Buffer.from(chunk))
        callback()
      },
    })

    return {
      stream,
      getBuffer: () => Buffer.concat(chunks),
    }
  }

  describe('Gzip Compression', () => {
    it('should compress data with gzip', async () => {
      const { stream, getBuffer } = createMemoryStream()

      const sink = createCompressionSink({
        algorithm: 'gzip',
        level: 6,
        workers: 1,
        output: stream,
      })

      const testData = Buffer.from('{"id": 1, "name": "Alice"}')

      // Compress
      await sink.onRawMatch!(testData)
      await sink.onDrain!()

      const compressed = getBuffer()

      // Verify compression (small data may have overhead)
      expect(compressed.length).toBeGreaterThan(0)

      // Verify decompression works correctly
      const decompressed = gunzipSync(compressed)
      expect(decompressed.toString()).toBe(testData.toString())
    })

    it('should handle multiple chunks', async () => {
      const { stream, getBuffer } = createMemoryStream()

      const sink = createCompressionSink({
        algorithm: 'gzip',
        workers: 2,
        output: stream,
      })

      const chunks = [Buffer.from('{"id": 1}'), Buffer.from('{"id": 2}'), Buffer.from('{"id": 3}')]

      // Compress all chunks
      for (const chunk of chunks) {
        await sink.onRawMatch!(chunk)
      }
      await sink.onDrain!()

      const compressed = getBuffer()
      expect(compressed.length).toBeGreaterThan(0)
    })
  })

  describe('Brotli Compression', () => {
    it('should compress data with brotli', async () => {
      const { stream, getBuffer } = createMemoryStream()

      const sink = createCompressionSink({
        algorithm: 'brotli',
        level: 4,
        workers: 1,
        output: stream,
      })

      const testData = Buffer.from('{"id": 1, "name": "Bob"}')

      // Compress
      await sink.onRawMatch!(testData)
      await sink.onDrain!()

      const compressed = getBuffer()

      // Verify compression (small data may have overhead)
      expect(compressed.length).toBeGreaterThan(0)

      // Verify decompression works correctly
      const decompressed = brotliDecompressSync(compressed)
      expect(decompressed.toString()).toBe(testData.toString())
    })
  })

  describe('Stats Tracking', () => {
    it('should track compression stats', async () => {
      const { stream } = createMemoryStream()

      let lastStats: any = null

      const sink = createCompressionSink({
        algorithm: 'gzip',
        workers: 1,
        output: stream,
        onStats: (stats) => {
          lastStats = stats
        },
      })

      const testData = Buffer.from('{"id": 1, "name": "Charlie"}')

      await sink.onRawMatch!(testData)
      await sink.onDrain!()

      // Verify stats
      expect(lastStats).not.toBeNull()
      expect(lastStats.bytesIn).toBe(testData.length)
      expect(lastStats.bytesOut).toBeGreaterThan(0)
      // Compression ratio = bytesIn / bytesOut (>1 means compressed)
      // For small data, overhead may cause ratio < 1
      expect(lastStats.compressionRatio).toBeGreaterThan(0)
      expect(lastStats.chunksProcessed).toBe(1)
    })
  })

  describe('Backpressure', () => {
    it('should handle slow output stream', async () => {
      let writeDelay = 0
      const chunks: Buffer[] = []

      const slowStream = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(Buffer.from(chunk))
          setTimeout(callback, writeDelay)
        },
      })

      const sink = createCompressionSink({
        algorithm: 'gzip',
        workers: 2,
        output: slowStream,
      })

      // Add delay after first chunk
      const testChunks = [Buffer.from('{"id": 1}'), Buffer.from('{"id": 2}')]

      await sink.onRawMatch!(testChunks[0])
      writeDelay = 50 // Slow down
      await sink.onRawMatch!(testChunks[1])
      await sink.onDrain!()

      // Should complete without errors
      expect(chunks.length).toBeGreaterThan(0)
    })
  })
})
