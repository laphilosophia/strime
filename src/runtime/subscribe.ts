import { Engine } from '../core/engine'
import { StrimeParser } from '../core/parser'

export interface SubscriptionOptions {
  onMatch: (data: any) => void
  onComplete?: () => void
  onError?: (err: Error) => void
  debug?: boolean
  signal?: AbortSignal
  budget?: { maxMatches?: number; maxBytes?: number; maxDurationMs?: number }
}

export interface StrimeSubscription {
  unsubscribe: () => void
}

/**
 * Strime Subscription
 * Connects a stream directly to a callback-based projection.
 * Ideal for real-time telemetry and high-intensity monitoring.
 */
export function subscribe(
  stream: ReadableStream<Uint8Array>,
  schema: string,
  options: SubscriptionOptions
): StrimeSubscription {
  const parser = new StrimeParser(schema)
  const map = parser.parse()

  const engine = new Engine(map, {
    debug: options.debug,
    onMatch: options.onMatch,
    signal: options.signal,
    budget: options.budget,
  })

  const reader = stream.getReader()
  let active = true

  const process = async () => {
    try {
      while (active) {
        const { done, value } = await reader.read()
        if (done) {
          options.onComplete?.()
          break
        }

        if (options.signal?.aborted) throw new Error('Aborted')

        engine.processChunk(value)
      }
    } catch (err: any) {
      if (active) options.onError?.(err)
    } finally {
      reader.releaseLock()
    }
  }

  process()

  return {
    unsubscribe: () => {
      active = false
      reader.cancel()
    },
  }
}
