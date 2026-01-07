import { build, query } from '../runtime/index'

async function runBenchmark() {
  const smallJson = { id: 1, name: 'Test', nested: { a: 1, b: 2 } }
  const largeArray = Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    name: `User ${i}`,
    email: `user${i}@example.com`,
    metadata: {
      tags: ['a', 'b', 'c'],
      details: {
        lastLogin: new Date().toISOString(),
        score: Math.random() * 100,
      },
    },
  }))
  const largeJson = { users: largeArray }
  const largeBuffer = new TextEncoder().encode(JSON.stringify(largeJson))

  console.log('--- Strime V2 Benchmark ---')
  console.log(`Payload size: ${(largeBuffer.length / (1024 * 1024)).toFixed(2)} MB`)

  // 1. Warmup
  await query(smallJson, '{ name }')

  // 2. Full Selection Benchmark
  console.time('Full Selection (10k items)')
  await query(largeBuffer, '{ users { id, name } }')
  console.timeEnd('Full Selection (10k items)')

  // 3. Skip-Heavy Benchmark (Querying only a few fields)
  console.time('Skip-Heavy (90% data skip)')
  await query(largeBuffer, '{ users { email } }')
  console.timeEnd('Skip-Heavy (90% data skip)')

  // 4. Progressive Indexing Benchmark (Amortized)
  const strime = build(largeBuffer)
  await strime.read('{ users { id } }') // First run - builds index

  console.time('Indexed Repeat Query')
  await strime.read('{ users { id } }')
  console.timeEnd('Indexed Repeat Query')
}

runBenchmark().catch(console.error)
