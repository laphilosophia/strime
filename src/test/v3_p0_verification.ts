import { AbortError, BudgetExhaustedError } from '../core/errors'
import { query } from '../runtime/index'

async function verifyP0() {
  console.log('--- Strime V3 P0 Verification ---')

  const largeArray = Array.from({ length: 5000 }, (_, i) => ({ id: i, val: 'x'.repeat(1024) }))
  const largeBuffer = new TextEncoder().encode(JSON.stringify(largeArray))

  // Helper to create a slow stream
  const createStream = () => {
    let offset = 0
    const chunkSize = 64 * 1024
    return new ReadableStream({
      async pull(controller) {
        if (offset >= largeBuffer.length) {
          controller.close()
          return
        }
        const next = largeBuffer.slice(offset, offset + chunkSize)
        offset += chunkSize
        controller.enqueue(next)
        // Simulate async delay to allow Event Loop to pick up AbortSignal
        await new Promise((r) => setTimeout(r, 0))
      },
    })
  }

  // 1. Verify AbortSignal (Streaming)
  console.log('Testing AbortSignal (Streaming)...')
  const controller = new AbortController()
  setTimeout(() => {
    controller.abort()
  }, 10)
  try {
    await query(createStream(), '{ id }', { signal: controller.signal })
    console.error('FAIL: AbortSignal did not throw')
  } catch (e: any) {
    if (e instanceof AbortError || e.name === 'AbortError') {
      console.log('PASS: AbortSignal threw AbortError')
    } else {
      console.error('FAIL: AbortSignal threw wrong error:', e)
    }
  }

  // 2. Verify maxMatches
  console.log('Testing maxMatches (limit 10)...')
  const matches: any[] = []
  try {
    await query(largeBuffer, '{ id }', {
      budget: { maxMatches: 10 },
      onMatch: (m) => matches.push(m),
    })
    console.error('FAIL: maxMatches did not throw')
  } catch (e: any) {
    if (e instanceof BudgetExhaustedError && e.limitType === 'MATCHES') {
      console.log(
        `PASS: maxMatches caught at ${matches.length} items (matched 11th triggers error)`
      )
    } else {
      console.error('FAIL: maxMatches threw wrong error:', e)
    }
  }

  // 3. Verify maxBytes
  console.log('Testing maxBytes (limit 1024)...')
  try {
    await query(largeBuffer, '{ id }', { budget: { maxBytes: 1024 } })
    console.error('FAIL: maxBytes did not throw')
  } catch (e: any) {
    if (e instanceof BudgetExhaustedError && e.limitType === 'BYTES') {
      console.log('PASS: maxBytes caught at limit')
    } else {
      console.error('FAIL: maxBytes threw wrong error:', e)
    }
  }

  // 4. Verify maxDurationMs
  console.log('Testing maxDurationMs (limit 1ms)...')
  try {
    await query(largeBuffer, '{ id }', { budget: { maxDurationMs: 1 } })
    console.error('FAIL: maxDurationMs did not throw')
  } catch (e: any) {
    if (e instanceof BudgetExhaustedError && e.limitType === 'DURATION') {
      console.log('PASS: maxDurationMs caught at limit')
    } else {
      console.error('FAIL: maxDurationMs threw wrong error:', e)
    }
  }
}

verifyP0().catch(console.error)
