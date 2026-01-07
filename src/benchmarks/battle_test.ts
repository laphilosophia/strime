import { ndjsonStream } from '../adapters/ndjson'
import { Engine } from '../core/engine'
import { JQLParser } from '../core/parser'

/**
 * JQL Battle-Test Suite
 * Focuses on extreme real-world scenarios.
 */

async function runBattleTest() {
  console.log('--- ⚔️ JQL Real-World Battle Test ⚔️ ---')

  // Scenario 1: Extreme Nesting (1000 levels)
  await testExtremeNesting(1000)

  // Scenario 2: Massive Streaming (1GB Synthetic NDJSON)
  await testMassiveStreaming(1000000) // 1M rows, roughly 1GB+ if items are large

  // Scenario 3: Randomized Corruption Stress
  await testRandomCorruption(10000)
}

async function testExtremeNesting(depth: number) {
  console.log(`\n[Scenario 1] Extreme Nesting (${depth} levels)`)

  let json = '{"root":'
  for (let i = 0; i < depth; i++) json += '{"node":'
  json += '"target"'
  for (let i = 0; i < depth; i++) json += '}'
  json += '}'

  const schema = '{ root { node { node } } }' // deep selector? No, JQL is simple
  // In JQL V2, you'd need the full path if you want the leaf, but let's test if it crashes or skips correctly
  const query = '{ root }'

  const buffer = new TextEncoder().encode(json)
  const map = new JQLParser(query).parse()
  const engine = new Engine(map)

  const start = performance.now()
  const result = engine.execute(buffer)
  const end = performance.now()

  console.log(`✓ Nesting handled in ${(end - start).toFixed(2)}ms`)
  console.log(`Memory Usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`)
}

async function testMassiveStreaming(rowCount: number) {
  console.log(`\n[Scenario 2] Massive Streaming (${rowCount} rows)`)

  let processed = 0
  let enqueued = 0
  const startTime = performance.now()

  const stream = new ReadableStream({
    pull(controller) {
      // Enqueue 1000 rows at a time to handle backpressure
      for (let i = 0; i < 1000 && enqueued < rowCount; i++, enqueued++) {
        const item = {
          id: enqueued,
          timestamp: Date.now(),
          data: 'X'.repeat(100),
          meta: { index: enqueued, type: 'telemetry' },
        }
        const chunk = new TextEncoder().encode(JSON.stringify(item) + '\n')
        controller.enqueue(chunk)
      }
      if (enqueued >= rowCount) {
        controller.close()
      }
    },
  })

  const schema = '{ id, meta { type } }'

  for await (const match of ndjsonStream(stream, schema)) {
    processed++
    if (processed % 250000 === 0) {
      const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
      console.log(`  Processed ${processed} matches... Memory: ${mem} MB`)
    }
  }

  const endTime = performance.now()
  console.log(`✓ 1M Rows processed in ${((endTime - startTime) / 1000).toFixed(2)}s`)
  console.log(`Final Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`)
}

async function testRandomCorruption(rowCount: number) {
  console.log(`\n[Scenario 3] Randomized Stream Corruption (${rowCount} rows)`)

  let enqueued = 0
  const stream = new ReadableStream({
    pull(controller) {
      for (let i = 0; i < 100 && enqueued < rowCount; i++, enqueued++) {
        let line: string
        if (Math.random() < 0.01) {
          // 1% chance of corruption
          const types = ['invalid_json', 'binary_noise', 'broken_literal', 'unterminated']
          const type = types[Math.floor(Math.random() * types.length)]
          switch (type) {
            case 'invalid_json':
              line = '{"missing_colon" "value"}\n'
              break
            case 'binary_noise':
              line = Buffer.from([0x00, 0x01, 0x5b, 0x7b, 0xff]).toString() + '\n'
              break
            case 'broken_literal':
              line = '{"val": truX}\n'
              break
            case 'unterminated':
              line = '{"name": "partial...\n'
              break
            default:
              line = '!!!GARBAGE!!!\n'
          }
        } else {
          line = JSON.stringify({ id: enqueued, ok: true }) + '\n'
        }
        controller.enqueue(new TextEncoder().encode(line))
      }
      if (enqueued >= rowCount) {
        controller.close()
      }
    },
  })

  const schema = '{ id, ok }'
  let matches = 0
  let aborts = 0

  try {
    for await (const match of ndjsonStream(stream, schema)) {
      if (match?.ok) matches++
    }
  } catch (err: any) {
    aborts++
    console.log(`  Stream aborted on corruption as expected: ${err.message}`)
  }

  console.log(`✓ Finished with ${matches} valid matches before abort.`)
}

runBattleTest().catch(console.error)
