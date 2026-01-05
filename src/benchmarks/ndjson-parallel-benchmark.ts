import { readFileSync } from 'fs'
import { ndjsonParallel } from '../adapters/ndjson-parallel'
import { OrderingMode } from '../adapters/ordering-gate'

/**
 * NDJSON Parallel Benchmark
 *
 * NOTE: This benchmark requires running AFTER build:
 * 1. npm run build
 * 2. node dist/benchmarks/ndjson-parallel-benchmark.js
 *
 * Parallel mode uses worker_threads which require compiled .js files.
 */

interface BenchmarkResult {
  mode: string
  workers?: number
  ordering?: OrderingMode
  query: string
  medianMs: number
  throughputMbps: number
  speedup?: number
}

async function runBenchmark(
  buffer: Buffer,
  query: string,
  options: {
    parallel: boolean
    workers?: number
    ordering?: OrderingMode
  }
): Promise<number> {
  const times: number[] = []

  for (let i = 0; i < 3; i++) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(buffer))
        controller.close()
      },
    })

    const start = performance.now()

    // Consume the stream
    for await (const _ of ndjsonParallel(stream, query, options)) {
      // Just consume
    }

    const duration = performance.now() - start
    times.push(duration)
  }

  // Return median
  return times.sort((a, b) => a - b)[1]
}

async function main() {
  console.log('NDJSON Parallel Benchmark')
  console.log('='.repeat(60))
  console.log('')

  // Load dataset
  const buffer = readFileSync('data/1GB.json')
  const fileSizeMB = buffer.length / 1024 / 1024
  console.log(`Dataset: ${fileSizeMB.toFixed(2)} MB (${buffer.length} bytes)`)
  console.log('')

  const queries = [
    { name: 'Simple', query: '{ id }' },
    { name: 'Complex', query: '{ id, name, email, address { city, zip } }' },
  ]

  const results: BenchmarkResult[] = []

  for (const { name, query } of queries) {
    console.log(`Query: ${name} - ${query}`)
    console.log('-'.repeat(60))

    // Serial baseline
    console.log('Running serial mode...')
    const serialMs = await runBenchmark(buffer, query, { parallel: false })
    const serialThroughput = (buffer.length * 8) / (serialMs * 1000)

    results.push({
      mode: 'Serial',
      query: name,
      medianMs: serialMs,
      throughputMbps: serialThroughput,
    })

    console.log(`  Median: ${(serialMs / 1000).toFixed(2)}s`)
    console.log(`  Throughput: ${serialThroughput.toFixed(2)} Mbps`)
    console.log('')

    // Parallel modes
    for (const workers of [2, 4, 8]) {
      for (const ordering of ['preserve', 'relaxed'] as OrderingMode[]) {
        console.log(`Running parallel (${workers} workers, ${ordering})...`)
        const parallelMs = await runBenchmark(buffer, query, {
          parallel: true,
          workers,
          ordering,
        })
        const parallelThroughput = (buffer.length * 8) / (parallelMs * 1000)
        const speedup = serialMs / parallelMs

        results.push({
          mode: 'Parallel',
          workers,
          ordering,
          query: name,
          medianMs: parallelMs,
          throughputMbps: parallelThroughput,
          speedup,
        })

        console.log(`  Median: ${(parallelMs / 1000).toFixed(2)}s`)
        console.log(`  Throughput: ${parallelThroughput.toFixed(2)} Mbps`)
        console.log(`  Speedup: ${speedup.toFixed(2)}x`)
        console.log('')
      }
    }
  }

  // Summary table
  console.log('')
  console.log('Summary')
  console.log('='.repeat(60))
  console.log('')

  for (const { name, query } of queries) {
    console.log(`Query: ${name}`)
    console.log('-'.repeat(60))

    const queryResults = results.filter((r) => r.query === name)
    const serial = queryResults.find((r) => r.mode === 'Serial')!

    console.log(
      `${'Mode'.padEnd(25)} ${'Time'.padEnd(10)} ${'Throughput'.padEnd(15)} ${'Speedup'.padEnd(10)}`
    )
    console.log('-'.repeat(60))

    for (const result of queryResults) {
      const mode =
        result.mode === 'Serial' ? 'Serial' : `Parallel (${result.workers}w, ${result.ordering})`

      const time = `${(result.medianMs / 1000).toFixed(2)}s`
      const throughput = `${result.throughputMbps.toFixed(2)} Mbps`
      const speedup = result.speedup ? `${result.speedup.toFixed(2)}x` : '-'

      console.log(
        `${mode.padEnd(25)} ${time.padEnd(10)} ${throughput.padEnd(15)} ${speedup.padEnd(10)}`
      )
    }

    console.log('')
  }

  // Performance analysis
  console.log('Performance Analysis')
  console.log('='.repeat(60))

  const bestParallel = results
    .filter((r) => r.mode === 'Parallel')
    .sort((a, b) => b.throughputMbps - a.throughputMbps)[0]

  console.log(`Best parallel configuration:`)
  console.log(`  Workers: ${bestParallel.workers}`)
  console.log(`  Ordering: ${bestParallel.ordering}`)
  console.log(`  Throughput: ${bestParallel.throughputMbps.toFixed(2)} Mbps`)
  console.log(`  Speedup: ${bestParallel.speedup!.toFixed(2)}x`)
  console.log('')

  // Check if target met
  const targetMbps = 1200
  if (bestParallel.throughputMbps >= targetMbps) {
    console.log(`✓ Target met: ${targetMbps} Mbps`)
  } else {
    console.log(
      `⚠️  Target not met: ${bestParallel.throughputMbps.toFixed(2)} Mbps < ${targetMbps} Mbps`
    )
  }
}

main().catch(console.error)
