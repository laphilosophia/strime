/**
 * Compression Worker - Compresses data chunks in parallel
 *
 * Supports:
 * - gzip (fast, good compression)
 * - brotli (slower, better compression)
 */

import { parentPort } from 'node:worker_threads'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

interface CompressionMessage {
  id: number
  data: Uint8Array
  algorithm: 'gzip' | 'brotli'
  level?: number
}

interface CompressionResponse {
  id: number
  compressed?: Uint8Array
  error?: string
}

// Worker message handler
if (parentPort) {
  parentPort.on('message', (message: CompressionMessage) => {
    try {
      const { id, data, algorithm, level = 6 } = message

      let compressed: Uint8Array

      if (algorithm === 'gzip') {
        compressed = gzipSync(data, { level })
      } else {
        // Brotli
        compressed = brotliCompressSync(data, {
          params: {
            [constants.BROTLI_PARAM_QUALITY]: level,
          },
        })
      }

      const response: CompressionResponse = {
        id,
        compressed,
      }

      // Transfer buffer ownership for zero-copy
      if (compressed.buffer instanceof ArrayBuffer) {
        parentPort!.postMessage(response, { transfer: [compressed.buffer] })
      } else {
        parentPort!.postMessage(response)
      }
    } catch (error) {
      parentPort!.postMessage({
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
