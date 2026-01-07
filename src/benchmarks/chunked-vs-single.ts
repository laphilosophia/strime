import { readFileSync } from 'fs'
import { Engine } from '../core/engine'
import { StrimeParser } from '../core/parser'

/**
 * Chunked Execution Benchmark
 * Compares execute() vs executeChunked() for skip-heavy workloads
 */

function runBenchmark() {
  console.log('='.repeat(70))
  console.log('execute() vs executeChunked() Benchmark')
  console.log('='.repeat(70))

  const file = 'data/1gb_5lvl_nested_formatted.json'
  let buffer: Buffer

  try {
    buffer = readFileSync(file)
  } catch {
    console.log(`\nFile not found: ${file}`)
    console.log('Generating synthetic test data...\n')
    buffer = generateTestData(50 * 1024 * 1024) // 50MB
  }

  console.log(`\nBuffer Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`)

  // Skip-heavy query (most data skipped)
  const schema = '{ employee { id } }'
  const selectionMap = new StrimeParser(schema).parse()

  // Warmup
  console.log('\nWarming up...')
  const warmupEngine = new Engine(selectionMap)
  warmupEngine.executeChunked(buffer.subarray(0, 1024 * 1024))

  const iterations = 3

  // Benchmark execute() - single buffer
  console.log(`\nexecute() (single buffer) - ${iterations} iterations...`)
  const executeTimes: number[] = []
  for (let i = 0; i < iterations; i++) {
    const engine = new Engine(selectionMap, { sink: { onMatch: () => {} } })
    const start = performance.now()
    engine.execute(buffer)
    executeTimes.push(performance.now() - start)
  }
  const executeAvg = executeTimes.reduce((a, b) => a + b) / iterations

  // Benchmark executeChunked() - 64KB chunks
  console.log(`executeChunked(64KB) - ${iterations} iterations...`)
  const chunked64Times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const engine = new Engine(selectionMap, { sink: { onMatch: () => {} } })
    const start = performance.now()
    engine.executeChunked(buffer, 64 * 1024)
    chunked64Times.push(performance.now() - start)
  }
  const chunked64Avg = chunked64Times.reduce((a, b) => a + b) / iterations

  // Benchmark executeChunked() - 32KB chunks
  console.log(`executeChunked(32KB) - ${iterations} iterations...`)
  const chunked32Times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const engine = new Engine(selectionMap, { sink: { onMatch: () => {} } })
    const start = performance.now()
    engine.executeChunked(buffer, 32 * 1024)
    chunked32Times.push(performance.now() - start)
  }
  const chunked32Avg = chunked32Times.reduce((a, b) => a + b) / iterations

  // Results
  const mbps = (bytes: number, ms: number) => ((bytes * 8) / (ms * 1000)).toFixed(2)

  console.log('\n' + '='.repeat(70))
  console.log('RESULTS')
  console.log('='.repeat(70))
  console.log(
    `execute() (single):     ${executeAvg.toFixed(0)}ms @ ${mbps(buffer.length, executeAvg)} Mbps`
  )
  console.log(
    `executeChunked(64KB):   ${chunked64Avg.toFixed(0)}ms @ ${mbps(
      buffer.length,
      chunked64Avg
    )} Mbps`
  )
  console.log(
    `executeChunked(32KB):   ${chunked32Avg.toFixed(0)}ms @ ${mbps(
      buffer.length,
      chunked32Avg
    )} Mbps`
  )

  console.log('\n' + '-'.repeat(70))
  const speedup64 = ((executeAvg / chunked64Avg - 1) * 100).toFixed(1)
  const speedup32 = ((executeAvg / chunked32Avg - 1) * 100).toFixed(1)
  console.log(`Speedup (64KB chunks): ${speedup64}%`)
  console.log(`Speedup (32KB chunks): ${speedup32}%`)
}

function generateTestData(targetSize: number): Buffer {
  const items: string[] = []
  const template = {
    employee: {
      id: 1,
      name: 'Test Employee',
      department: 'Engineering',
      metadata: {
        created: '2024-01-01',
        updated: '2024-12-01',
        tags: ['a', 'b', 'c', 'd', 'e'],
        nested: {
          level1: { level2: { level3: { value: 'deep' } } },
        },
      },
      largeArray: Array(100).fill({ x: 1, y: 2, z: 3 }),
    },
  }

  const itemStr = JSON.stringify(template)
  const count = Math.ceil(targetSize / itemStr.length)

  for (let i = 0; i < count; i++) {
    items.push(itemStr)
  }

  return Buffer.from('[' + items.join(',') + ']')
}

runBenchmark()
