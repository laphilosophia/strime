import { Engine } from '../core/engine'
import { StrimeParser } from '../core/parser'
import { Tokenizer, TokenType } from '../core/tokenizer'

export type StrimeSource = string | Uint8Array | object | ReadableStream<Uint8Array>

export type StrimeMode = 'streaming' | 'indexed'

export interface StrimeOptions {
  mode?: StrimeMode
  debug?: boolean
  signal?: AbortSignal
  budget?: { maxMatches?: number; maxBytes?: number; maxDurationMs?: number }
  onMatch?: (data: any) => void
  sink?: import('../core/sink').OutputSink
  emitMode?: 'object' | 'raw'
}

export interface StrimeInstance {
  read: <T = any>(schema: string) => Promise<T>
}

/**
 * Strime Instance Manager
 * Manages the lifecycle of a Strime source, including optional indexing.
 *
 * LifeCycle:
 * - Index is ephemeral and tied to the instance.
 * - Source is immutable once passed to build().
 * - Indexed mode is opt-in to maintain O(1) memory guarantees by default.
 */
export function build(source: StrimeSource, options: StrimeOptions = {}): StrimeInstance {
  let rootIndex: Map<string, number> | undefined
  let queryCount = 0
  const mode = options.mode || 'streaming'

  const instance: StrimeInstance = {
    read: async <T = any>(schema: string): Promise<T> => {
      queryCount++
      const parser = new StrimeParser(schema)
      const map = parser.parse()

      // Collect async sink promises for backpressure
      const pendingPromises: Promise<void>[] = []

      // Wrap sink to collect promises (for both buffer and stream modes)
      const wrappedSink = options.sink
        ? {
            onMatch: (data: any) => {
              const result = options.sink!.onMatch?.(data)
              if (result instanceof Promise) {
                pendingPromises.push(result)
              }
            },
            onRawMatch: (chunk: Uint8Array) => {
              const result = options.sink!.onRawMatch?.(chunk)
              if (result instanceof Promise) {
                pendingPromises.push(result)
              }
            },
            onStats: options.sink.onStats,
          }
        : undefined

      // Auto-wrap selection if it looks like an object-selector but source might be an array
      // In Strime, if root is array, the Engine applies selection to its elements.
      const engine = new Engine(map, {
        debug: options.debug,
        signal: options.signal,
        budget: options.budget,
        onMatch: options.onMatch,
        sink: wrappedSink,
        emitMode: options.emitMode,
      })

      if (source instanceof ReadableStream) {
        if (mode === 'indexed') {
          console.warn(
            '[Strime] Indexed mode is not supported for ReadableStream. Falling back to streaming.'
          )
        }

        const reader = source.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          engine.processChunk(value)
        }

        // Wait for all pending async sink operations
        await Promise.all(pendingPromises)

        if (options.sink?.onStats) {
          options.sink.onStats(engine.getStats())
        }

        // Graceful shutdown - call onDrain if present
        await options.sink?.onDrain?.()

        const res = engine.getResult()
        // If we have an onMatch handler, and the result is the root array itself,
        // we've already emitted its elements. Returning the full array here
        // is standard for read(), but for subscribe() we need to be careful.
        return res as T
      }

      const buffer = prepareBuffer(source)

      // Progressive indexing: only if mode is 'indexed' and it's a repeat query
      if (mode === 'indexed' && queryCount > 1 && !rootIndex && buffer.length > 1024 * 1024) {
        rootIndex = buildRootIndex(buffer)
      }

      let startOffset = 0
      if (mode === 'indexed' && rootIndex) {
        const rootKeys = Object.keys(map)
        let minOffset = Infinity
        for (const key of rootKeys) {
          const offset = rootIndex.get(key)
          if (offset !== undefined && offset < minOffset) {
            minOffset = offset
          }
        }
        if (minOffset !== Infinity) {
          // Jump to the first needed key with a safety cushion
          startOffset = Math.max(0, minOffset - 50)
        }
      }

      const result = engine.execute(buffer.subarray(startOffset)) as T

      // Wait for all pending async sink operations
      await Promise.all(pendingPromises)

      // Graceful shutdown - call onDrain if present
      await options.sink?.onDrain?.()

      return result
    },
  }

  return instance
}

/**
 * Build an index of root-level keys and their byte positions.
 * This enables the indexed mode to skip directly to requested keys.
 *
 * @param buffer - JSON buffer to index
 * @returns Map of key names to their byte positions
 */
function buildRootIndex(buffer: Uint8Array): Map<string, number> {
  const index = new Map<string, number>()
  const tokenizer = new Tokenizer()
  let depth = 0
  let currentKey: string | null = null

  for (const token of tokenizer.tokenize(buffer)) {
    if (token.type === TokenType.LEFT_BRACE || token.type === TokenType.LEFT_BRACKET) {
      depth++
    } else if (token.type === TokenType.RIGHT_BRACE || token.type === TokenType.RIGHT_BRACKET) {
      depth--
      // Early exit: if we've exited the root object and have keys, we're done
      if (depth === 0 && index.size > 0) {
        break
      }
    } else if (depth === 1 && token.type === TokenType.STRING && currentKey === null) {
      // At root level, found a potential key
      currentKey = token.value as string
    } else if (depth === 1 && token.type === TokenType.COLON && currentKey !== null) {
      // Found the colon after a key, record the position
      index.set(currentKey, token.start)
      currentKey = null
    }
  }

  return index
}

export async function query<T = any>(
  source: StrimeSource,
  schema: string,
  options?: StrimeOptions
): Promise<T> {
  const { read } = build(source, options)
  return read<T>(schema)
}

function prepareBuffer(source: StrimeSource): Uint8Array {
  if (source instanceof Uint8Array) return source
  if (typeof source === 'string') return new TextEncoder().encode(source)
  if (typeof source === 'object') return new TextEncoder().encode(JSON.stringify(source))
  throw new Error('Invalid source provided')
}
