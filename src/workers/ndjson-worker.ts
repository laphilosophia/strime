/**
 * NDJSON Worker - Processes single NDJSON lines in parallel
 *
 * Worker contract:
 * - Receives: { id, line, query }
 * - Returns: { id, result, error? }
 *
 * Worker does NOT:
 * - See the stream
 * - Know about backpressure
 * - Handle ordering
 */

import { parentPort } from 'node:worker_threads'

interface WorkerMessage {
  id: number
  line: Uint8Array
  query: string
  emitMode?: 'object' | 'raw'
}

interface WorkerResponse {
  id: number
  result?: any
  raw?: Uint8Array
  error?: string
}

// Worker message handler
if (parentPort) {
  parentPort.on('message', async (message: any) => {
    try {
      const { id, line, query, emitMode } = message

      // Dynamically import to avoid bundling issues
      const { JQLParser } = await import('../core/parser.js')
      const { Engine } = await import('../core/engine.js')

      // Parse query
      const parser = new JQLParser(query)
      const map = parser.parse()

      // Process line
      let result: any
      let raw: Uint8Array | undefined

      const engine = new Engine(map, {
        emitMode,
        sink:
          emitMode === 'raw'
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

      // Send result back
      const response = {
        id,
        result: emitMode === 'object' ? result : undefined,
        raw: emitMode === 'raw' ? raw : undefined,
      }

      // For raw mode, transfer buffer ownership
      if (raw && raw.buffer instanceof ArrayBuffer) {
        parentPort!.postMessage(response, { transfer: [raw.buffer] })
      } else {
        parentPort!.postMessage(response)
      }
    } catch (error) {
      parentPort!.postMessage({
        id: (message as any).id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
