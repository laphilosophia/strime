import { OutputSink, StrimeStats } from '../core/sink'
import { query } from '../runtime/index'

async function verifyP1() {
  console.log('--- Strime V3 P1 Infrastructure Verification ---')

  // 1. Verify Telemetry (StrimeStats)
  console.log('Testing Telemetry (onStats)...')
  let finalStats: StrimeStats | undefined

  const sink: OutputSink = {
    onMatch: () => {},
    onStats: (stats) => {
      finalStats = stats
    },
  }

  const largeData = JSON.stringify({
    items: Array.from({ length: 100 }, (_, i) => ({ id: i })),
    metadata: {
      description: 'y'.repeat(10000),
      stats: 'z'.repeat(10000),
    },
  })
  const buffer = new TextEncoder().encode(largeData)

  // We query just the items to measure stats
  await query(buffer, '{ items { id } }', { sink })

  if (finalStats) {
    console.log('Stats received:', JSON.stringify(finalStats, null, 2))
    if (finalStats.matchedCount === 1) console.log('PASS: matchedCount is 1')
    if (finalStats.skipRatio > 0)
      console.log(`PASS: skipRatio is ${finalStats.skipRatio.toFixed(4)}`)
  } else {
    console.error('FAIL: No stats received')
  }

  // 2. Verify emitRaw (Cross-Chunk)
  console.log('\nTesting emitRaw (Cross-Chunk Assembly)...')
  const rawTarget = { longString: 'A'.repeat(500) }
  const rawJSON = JSON.stringify(rawTarget)
  const rawBuffer = new TextEncoder().encode(rawJSON)

  // Split into two chunks
  const chunk1 = rawBuffer.slice(0, 250)
  const chunk2 = rawBuffer.slice(250)

  let capturedRaw: Uint8Array | undefined
  const rawSink: OutputSink = {
    onMatch: () => {},
    onRawMatch: (bytes) => {
      capturedRaw = bytes
    },
  }

  function createSplitStream() {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(chunk1)
        controller.enqueue(chunk2)
        controller.close()
      },
    })
  }

  await query(createSplitStream(), '{ longString }', {
    sink: rawSink,
    emitMode: 'raw',
  })

  if (capturedRaw) {
    const decoded = new TextDecoder().decode(capturedRaw)
    console.log('Captured Raw (Length):', capturedRaw.length)
    if (decoded === rawJSON) {
      console.log('PASS: Raw bytes match original JSON exactly.')
    } else {
      console.error('FAIL: Raw bytes mismatch!')
      console.error('Expected:', rawJSON.substring(0, 50) + '...')
      console.error('Got:     ', decoded.substring(0, 50) + '...')
    }
  } else {
    console.error('FAIL: No raw match captured')
  }
}

verifyP1().catch((e) => {
  console.error(e)
  process.exit(1)
})
