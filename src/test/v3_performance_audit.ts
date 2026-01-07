import { createReadStream } from 'fs'
import { Readable } from 'stream'
import { query } from '../runtime/index'

interface BenchmarkResult {
  name: string
  duration: number
  throughputMbps: number
  matchCount: number
  fileSize: number
}

async function runBenchmark(
  name: string,
  filePath: string,
  jqlQuery: string
): Promise<BenchmarkResult> {
  const nodeStream = createReadStream(filePath)
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>

  let matchCount = 0
  const start = performance.now()

  await query(webStream, jqlQuery, {
    onMatch: () => {
      matchCount++
    },
  })

  const duration = performance.now() - start
  const stats = await import('fs').then((fs) => fs.promises.stat(filePath))
  const fileSize = stats.size
  const throughputMbps = (fileSize * 8) / (duration * 1000)

  return {
    name,
    duration,
    throughputMbps,
    matchCount,
    fileSize,
  }
}

async function main() {
  console.log('='.repeat(80))
  console.log('JQL V3.0.0 - Pre-Phase 3 Performance Audit')
  console.log('='.repeat(80))
  console.log('')

  const benchmarks: BenchmarkResult[] = []

  // Baseline: Simple ID projection (original 4.38s benchmark)
  console.log('Running Baseline Benchmark (Simple Projection)...')
  const baseline = await runBenchmark('Baseline: { id }', 'data/1GB.json', '{ id }')
  benchmarks.push(baseline)
  console.log(`  Duration: ${(baseline.duration / 1000).toFixed(2)}s`)
  console.log(`  Throughput: ${baseline.throughputMbps.toFixed(2)} Mbps`)
  console.log(`  Matches: ${baseline.matchCount}`)
  console.log('')

  // Nested projection
  console.log('Running Nested Projection Benchmark...')
  const nested = await runBenchmark(
    'Nested: { user { name, email } }',
    'data/1GB.json',
    '{ user { name, email } }'
  )
  benchmarks.push(nested)
  console.log(`  Duration: ${(nested.duration / 1000).toFixed(2)}s`)
  console.log(`  Throughput: ${nested.throughputMbps.toFixed(2)} Mbps`)
  console.log('')

  // Multiple fields
  console.log('Running Multi-Field Projection Benchmark...')
  const multiField = await runBenchmark(
    'Multi-Field: { id, name, email }',
    'data/1GB.json',
    '{ id, name, email }'
  )
  benchmarks.push(multiField)
  console.log(`  Duration: ${(multiField.duration / 1000).toFixed(2)}s`)
  console.log(`  Throughput: ${multiField.throughputMbps.toFixed(2)} Mbps`)
  console.log('')

  // Summary
  console.log('='.repeat(80))
  console.log('PERFORMANCE SUMMARY')
  console.log('='.repeat(80))
  console.log('')
  console.log('Baseline Reference: 4.38s')
  console.log(`Current Baseline:   ${(baseline.duration / 1000).toFixed(2)}s`)

  const regression = ((baseline.duration / 1000 - 4.38) / 4.38) * 100
  if (regression > 5) {
    console.log(`⚠️  REGRESSION DETECTED: +${regression.toFixed(1)}% slower`)
  } else if (regression > 0) {
    console.log(`✓  Minor variance: +${regression.toFixed(1)}% (within tolerance)`)
  } else {
    console.log(`✓  PERFORMANCE IMPROVED: ${Math.abs(regression).toFixed(1)}% faster`)
  }
  console.log('')

  // Detailed results
  console.log('Detailed Results:')
  console.log('-'.repeat(80))
  benchmarks.forEach((b) => {
    console.log(b.name)
    console.log(`  Duration:    ${(b.duration / 1000).toFixed(2)}s`)
    console.log(`  Throughput:  ${b.throughputMbps.toFixed(2)} Mbps`)
    console.log(`  File Size:   ${(b.fileSize / 1024 / 1024).toFixed(2)} MB`)
    console.log('')
  })
}

main().catch(console.error)
