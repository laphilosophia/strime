import { ndjsonStream } from '../adapters/ndjson'
import { AbortError, BudgetExhaustedError } from '../core/errors'

async function verifyPartialSafety() {
  console.log('--- Strime V3 Partial Output Safety Test ---')

  const items = Array.from({ length: 100 }, (_, i) => ({ id: i, data: 'payload-' + i }))
  const ndjsonBuffer = new TextEncoder().encode(items.map((i) => JSON.stringify(i)).join('\n'))

  const createSlowStream = () => {
    let offset = 0
    return new ReadableStream({
      async pull(controller) {
        if (offset >= ndjsonBuffer.length) {
          controller.close()
          return
        }
        const next = ndjsonBuffer.slice(offset, offset + 100) // Small chunks
        offset += 100
        controller.enqueue(next)
        await new Promise((r) => setTimeout(r, 1)) // Yield to allow abort
      },
    })
  }

  // Test: Abort mid-stream
  console.log('Test: Abort mid-stream...')
  const controller = new AbortController()
  const results: any[] = []

  try {
    const stream = createSlowStream()
    setTimeout(() => {
      controller.abort()
    }, 20)

    for await (const result of ndjsonStream(stream, '{ id, data }', {
      signal: controller.signal,
    })) {
      results.push(result)
    }
  } catch (e) {
    if (e instanceof AbortError || e.name === 'AbortError') {
      console.log(`Caught Abort after ${results.length} items.`)
    } else {
      console.error('Unexpected error during abort:', e)
      process.exit(1)
    }
  }

  // Verification: Ensure all emitted items are complete and valid
  results.forEach((item, i) => {
    if (!item || typeof item.id !== 'number' || !item.data) {
      console.error(`FAIL: Item at index ${i} is corrupted:`, item)
      process.exit(1)
    }
  })
  console.log('PASS: All emitted items are valid objects.')

  // Test: Budget Exhaustion (Matches)
  console.log('\nTest: Budget Exhaustion (maxMatches: 15)...')
  const budgetResults: any[] = []
  try {
    for (let i = 0; i < 100; i++) {
      // ...
    }
    const stream = createSlowStream()
    for await (const result of ndjsonStream(stream, '{ id }', {
      budget: { maxMatches: 15 },
      debug: true,
    })) {
      budgetResults.push(result)
    }
  } catch (e) {
    if (e instanceof BudgetExhaustedError && e.limitType === 'MATCHES') {
      console.log(`Caught BudgetExhausted after ${budgetResults.length} items.`)
    } else {
      console.error('Unexpected error during budget kill:', e)
      process.exit(1)
    }
  }

  if (budgetResults.length !== 15) {
    console.error(`FAIL: Expected 15 items, got ${budgetResults.length}`)
    process.exit(1)
  }
  console.log('PASS: Budget killed exactly at limit with valid data.')
}

verifyPartialSafety().catch((e) => {
  console.error(e)
  process.exit(1)
})
