import { readFileSync } from 'fs'
import { query } from '../runtime/index'

/**
 * Test 1: emitRaw ON vs OFF Comparison
 *
 * Critical test to verify that raw emission doesn't degrade performance
 * when not needed, and provides zero-copy benefits when used.
 */

async function test1_emitRawComparison() {
  console.log('='.repeat(80))
  console.log('TEST 1: emitRaw ON vs OFF Comparison')
  console.log('='.repeat(80))
  console.log('')

  const buffer = readFileSync('data/1GB.json')
  const strimeQuery = '{ id }'

  // Test A: emitRaw OFF (default object mode)
  console.log('A. Object Mode (emitRaw: OFF)')
  const timesObject: number[] = []
  for (let i = 0; i < 3; i++) {
    const start = performance.now()
    await query(buffer, strimeQuery)
    const duration = performance.now() - start
    timesObject.push(duration)
    console.log(`  Run ${i + 1}: ${(duration / 1000).toFixed(2)}s`)
  }

  const medianObject = timesObject.sort((a, b) => a - b)[1]
  const throughputObject = (buffer.length * 8) / (medianObject * 1000)

  console.log('')

  // Test B: emitRaw ON
  console.log('B. Raw Mode (emitRaw: ON)')
  const timesRaw: number[] = []
  let rawByteCount = 0

  for (let i = 0; i < 3; i++) {
    rawByteCount = 0
    const start = performance.now()
    await query(buffer, strimeQuery, {
      emitMode: 'raw',
      sink: {
        onRawMatch: (bytes) => {
          rawByteCount += bytes.length
        },
      },
    })
    const duration = performance.now() - start
    timesRaw.push(duration)
    console.log(`  Run ${i + 1}: ${(duration / 1000).toFixed(2)}s (captured ${rawByteCount} bytes)`)
  }

  const medianRaw = timesRaw.sort((a, b) => a - b)[1]
  const throughputRaw = (buffer.length * 8) / (medianRaw * 1000)

  console.log('')
  console.log('Results:')
  console.log('-'.repeat(80))
  console.log(
    `Object Mode:  ${(medianObject / 1000).toFixed(2)}s (${throughputObject.toFixed(2)} Mbps)`
  )
  console.log(`Raw Mode:     ${(medianRaw / 1000).toFixed(2)}s (${throughputRaw.toFixed(2)} Mbps)`)

  const overhead = ((medianRaw - medianObject) / medianObject) * 100
  console.log('')
  if (Math.abs(overhead) < 5) {
    console.log(`✅ Raw mode overhead: ${overhead.toFixed(1)}% (acceptable)`)
  } else if (overhead > 0) {
    console.log(`⚠️  Raw mode overhead: +${overhead.toFixed(1)}%`)
  } else {
    console.log(`✅ Raw mode faster: ${Math.abs(overhead).toFixed(1)}%`)
  }
  console.log('')
}

/**
 * Test 2: Worst-Case String Payload
 *
 * Tests engine behavior with massive string values:
 * - Inside skip (should be fast - just skip the string)
 * - Outside skip (should handle large strings efficiently)
 */

async function test2_worstCaseStrings() {
  console.log('='.repeat(80))
  console.log('TEST 2: Worst-Case String Payload')
  console.log('='.repeat(80))
  console.log('')

  // Create test data with massive strings
  const largeString = 'A'.repeat(50 * 1024 * 1024) // 50 MB string

  const testData = {
    metadata: {
      description: largeString, // This will be SKIPPED
      version: '1.0',
    },
    payload: largeString, // This will be SELECTED
    id: 123,
  }

  const jsonString = JSON.stringify(testData)
  const buffer = new TextEncoder().encode(jsonString)

  console.log(`Test data size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`)
  console.log(`String size: ${(largeString.length / 1024 / 1024).toFixed(2)} MB`)
  console.log('')

  // Test A: Query that SKIPS the large string
  console.log('A. Large String in SKIP Path')
  const timesSkip: number[] = []
  for (let i = 0; i < 3; i++) {
    const start = performance.now()
    await query(buffer, '{ id }') // metadata.description will be skipped
    const duration = performance.now() - start
    timesSkip.push(duration)
    console.log(`  Run ${i + 1}: ${(duration / 1000).toFixed(2)}s`)
  }

  const medianSkip = timesSkip.sort((a, b) => a - b)[1]
  const throughputSkip = (buffer.length * 8) / (medianSkip * 1000)

  console.log('')

  // Test B: Query that SELECTS the large string
  console.log('B. Large String in SELECT Path')
  const timesSelect: number[] = []
  for (let i = 0; i < 3; i++) {
    const start = performance.now()
    const result = await query(buffer, '{ payload }') // Will materialize the 50MB string
    const duration = performance.now() - start
    timesSelect.push(duration)
    console.log(
      `  Run ${i + 1}: ${(duration / 1000).toFixed(2)}s (result: ${(
        result.payload.length /
        1024 /
        1024
      ).toFixed(2)} MB)`
    )
  }

  const medianSelect = timesSelect.sort((a, b) => a - b)[1]
  const throughputSelect = (buffer.length * 8) / (medianSelect * 1000)

  console.log('')
  console.log('Results:')
  console.log('-'.repeat(80))
  console.log(
    `Skip Path:    ${(medianSkip / 1000).toFixed(2)}s (${throughputSkip.toFixed(2)} Mbps)`
  )
  console.log(
    `Select Path:  ${(medianSelect / 1000).toFixed(2)}s (${throughputSelect.toFixed(2)} Mbps)`
  )

  const ratio = medianSelect / medianSkip
  console.log('')
  console.log(`Select/Skip Ratio: ${ratio.toFixed(2)}x`)

  if (ratio < 2) {
    console.log('✅ String handling efficient (select < 2x skip)')
  } else if (ratio < 5) {
    console.log('⚠️  String handling acceptable (select < 5x skip)')
  } else {
    console.log('❌ String handling needs optimization (select > 5x skip)')
  }
  console.log('')
}

async function main() {
  console.log('')
  console.log('╔' + '═'.repeat(78) + '╗')
  console.log('║' + ' '.repeat(20) + 'BATTLE-PROVEN VALIDATION TESTS' + ' '.repeat(27) + '║')
  console.log('╚' + '═'.repeat(78) + '╝')
  console.log('')

  try {
    await test1_emitRawComparison()
    await test2_worstCaseStrings()

    console.log('='.repeat(80))
    console.log('FINAL VERDICT')
    console.log('='.repeat(80))
    console.log('')
    console.log('If both tests show:')
    console.log('  1. emitRaw overhead < 5%')
    console.log('  2. String select/skip ratio < 5x')
    console.log('')
    console.log('Then: "Fastest streaming JSON projection in pure JS" is DEFENSIBLE.')
    console.log('')
  } catch (error) {
    console.error('Test failed:', error)
  }
}

main().catch(console.error)
