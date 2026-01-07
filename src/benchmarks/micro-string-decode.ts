/**
 * Micro-benchmark: String decoding strategies
 *
 * Tests different approaches for converting Uint8Array to string:
 * 1. String concatenation (current implementation)
 * 2. String.fromCharCode.apply()
 * 3. TextDecoder
 *
 * Goal: Validate 64-byte threshold hypothesis and measure real-world performance
 */

const ITERATIONS = 1_000_000
const WARMUP_ITERATIONS = 100_000

// Test data: realistic JSON keys and values
const TEST_CASES = [
  { name: 'tiny (4b)', data: new Uint8Array([110, 97, 109, 101]) }, // "name"
  { name: 'short (8b)', data: new Uint8Array([117, 115, 101, 114, 110, 97, 109, 101]) }, // "username"
  {
    name: 'medium (16b)',
    data: new Uint8Array([
      99, 114, 101, 97, 116, 101, 100, 95, 97, 116, 95, 116, 105, 109, 101, 115,
    ]),
  }, // "created_at_times"
  { name: 'threshold-32 (32b)', data: new Uint8Array(32).fill(65) }, // 32x 'A'
  { name: 'threshold-48 (48b)', data: new Uint8Array(48).fill(66) }, // 48x 'B'
  { name: 'threshold-64 (64b)', data: new Uint8Array(64).fill(67) }, // 64x 'C'
  { name: 'large (128b)', data: new Uint8Array(128).fill(68) }, // 128x 'D'
  { name: 'xlarge (256b)', data: new Uint8Array(256).fill(69) }, // 256x 'E'
]

// Strategy 1: String concatenation (current implementation)
function decodeConcat(buffer: Uint8Array): string {
  let result = ''
  for (let i = 0; i < buffer.length; i++) {
    result += String.fromCharCode(buffer[i])
  }
  return result
}

// Strategy 2: String.fromCharCode.apply()
function decodeApply(buffer: Uint8Array): string {
  return String.fromCharCode.apply(null, buffer as any)
}

// Strategy 3: TextDecoder
const decoder = new TextDecoder()
function decodeTextDecoder(buffer: Uint8Array): string {
  return decoder.decode(buffer)
}

// Benchmark runner
function benchmark(
  name: string,
  fn: (buffer: Uint8Array) => string,
  data: Uint8Array,
  iterations: number
): number {
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    fn(data)
  }
  const end = performance.now()
  return end - start
}

// Warmup to reach TurboFan optimization
function warmup() {
  console.log('🔥 Warming up JIT...')
  for (const testCase of TEST_CASES) {
    benchmark('warmup-concat', decodeConcat, testCase.data, WARMUP_ITERATIONS)
    benchmark('warmup-apply', decodeApply, testCase.data, WARMUP_ITERATIONS)
    benchmark('warmup-decoder', decodeTextDecoder, testCase.data, WARMUP_ITERATIONS)
  }
  console.log('✅ Warmup complete\n')
}

// Main benchmark
function runBenchmarks() {
  console.log('📊 String Decoding Micro-Benchmark')
  console.log('='.repeat(80))
  console.log(`Iterations per test: ${ITERATIONS.toLocaleString()}`)
  console.log('='.repeat(80))
  console.log()

  const results: {
    testCase: string
    concat: number
    apply: number
    decoder: number
  }[] = []

  for (const testCase of TEST_CASES) {
    console.log(`Testing: ${testCase.name} (${testCase.data.length} bytes)`)

    const concatTime = benchmark('concat', decodeConcat, testCase.data, ITERATIONS)
    const applyTime = benchmark('apply', decodeApply, testCase.data, ITERATIONS)
    const decoderTime = benchmark('decoder', decodeTextDecoder, testCase.data, ITERATIONS)

    results.push({
      testCase: testCase.name,
      concat: concatTime,
      apply: applyTime,
      decoder: decoderTime,
    })

    console.log(`  concat:  ${concatTime.toFixed(2)}ms`)
    console.log(`  apply:   ${applyTime.toFixed(2)}ms`)
    console.log(`  decoder: ${decoderTime.toFixed(2)}ms`)
    console.log()
  }

  // Analysis
  console.log('='.repeat(80))
  console.log('📈 Analysis')
  console.log('='.repeat(80))
  console.log()

  console.log('Relative Performance (lower is better):')
  console.log()
  console.log(
    'Size'.padEnd(20) + 'Concat'.padEnd(15) + 'Apply'.padEnd(15) + 'Decoder'.padEnd(15) + 'Winner'
  )
  console.log('-'.repeat(80))

  for (const result of results) {
    const baseline = Math.min(result.concat, result.apply, result.decoder)
    const concatRel = (result.concat / baseline).toFixed(2)
    const applyRel = (result.apply / baseline).toFixed(2)
    const decoderRel = (result.decoder / baseline).toFixed(2)

    let winner = ''
    if (result.concat === baseline) winner = 'concat'
    else if (result.apply === baseline) winner = 'apply'
    else if (result.decoder === baseline) winner = 'decoder'

    console.log(
      result.testCase.padEnd(20) +
        `${concatRel}x`.padEnd(15) +
        `${applyRel}x`.padEnd(15) +
        `${decoderRel}x`.padEnd(15) +
        winner
    )
  }

  console.log()
  console.log('='.repeat(80))
  console.log('🎯 Recommendations')
  console.log('='.repeat(80))
  console.log()

  // Find crossover point
  let applyWinThreshold = 0
  let decoderWinThreshold = 0

  for (const result of results) {
    const size = parseInt(/\d+/.exec(result.testCase)?.[0] || '0')
    if (result.apply < result.concat && applyWinThreshold === 0) {
      applyWinThreshold = size
    }
    if (result.decoder < result.apply && decoderWinThreshold === 0) {
      decoderWinThreshold = size
    }
  }

  console.log(`✅ apply() beats concat at: ~${applyWinThreshold}+ bytes`)
  console.log(`✅ TextDecoder beats apply() at: ~${decoderWinThreshold}+ bytes`)
  console.log()
  console.log('Suggested strategy:')
  console.log(`  if (len <= ${decoderWinThreshold}) -> String.fromCharCode.apply()`)
  console.log(`  if (len > ${decoderWinThreshold}) -> TextDecoder.decode()`)
  console.log()
}

// Run
warmup()
runBenchmarks()
