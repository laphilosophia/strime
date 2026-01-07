import { Engine } from '../core/engine'
import { StrimeParser } from '../core/parser'

async function runIsolationBench() {
  const largeArray = Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    name: 'Item ' + i,
    tags: ['a', 'b', 'c'],
    val: Math.random(),
  }))
  const buffer = new TextEncoder().encode(JSON.stringify(largeArray))
  const schema = '{ id, name, tags }'

  const parser = new StrimeParser(schema)
  const map = parser.parse()

  console.log('--- Strime V3 Hook Isolation Benchmark ---')
  console.log(`Payload: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`)

  const run = (label: string, skipHooks: boolean) => {
    ;(globalThis as any).__Strime_SKIP_P0_HOOKS__ = skipHooks
    const engine = new Engine(map)

    // Warmup
    for (let i = 0; i < 3; i++) engine.execute(buffer)

    const start = performance.now()
    const iterations = 10
    for (let i = 0; i < iterations; i++) {
      engine.reset()
      engine.execute(buffer)
    }
    const end = performance.now()
    const avg = (end - start) / iterations
    console.log(`${label}: ${avg.toFixed(3)}ms`)
    return avg
  }

  // Run multiple passes for stability
  const h1 = run('Hooks ENABLED (Pass 1)', false)
  const s1 = run('Hooks DISABLED (Pass 1)', true)
  const h2 = run('Hooks ENABLED (Pass 2)', false)
  const s2 = run('Hooks DISABLED (Pass 2)', true)

  const avgH = (h1 + h2) / 2
  const avgS = (s1 + s2) / 2
  const overhead = ((avgH - avgS) / avgS) * 100

  console.log('---------------------------------------')
  console.log(`Average Hooked:   ${avgH.toFixed(3)}ms`)
  console.log(`Average Baseline: ${avgS.toFixed(3)}ms`)
  console.log(`Estimated Overhead: ${overhead.toFixed(2)}%`)

  if (overhead < 3) {
    console.log('PASS: Hook overhead is within 3% tolerance.')
  } else {
    console.log('FAIL: Hook overhead exceeds tolerance. Optimization required.')
  }

  ;(globalThis as any).__Strime_SKIP_P0_HOOKS__ = false // Reset
}

runIsolationBench().catch(console.error)
