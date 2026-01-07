import { createReadStream } from 'fs'
import { Readable } from 'stream'
import { OutputSink } from '../core/sink'
import { build } from '../runtime/index'

async function stressTest() {
  console.log('--- Strime V3 1GB Stress Test ---')
  const filePath = 'data/1GB.json'

  let matches = 0
  const sink: OutputSink = {
    onMatch: () => {
      matches++
    },
    onStats: (stats) => {
      console.log('\nFinal Stats:')
      console.log(JSON.stringify(stats, null, 2))
    },
  }

  const nodeStream = createReadStream(filePath)
  // Convert Node stream to Web ReadableStream
  const webStream = Readable.toWeb(nodeStream) as any as ReadableStream<Uint8Array>

  console.log('Starting query on 1GB.json...')
  // We'll perform a query that requires scanning but also allows skipping
  // Assuming the 1GB.json has many items or a large structure.
  const start = Date.now()

  try {
    const { read } = build(webStream, { sink, debug: false })
    // Root objects might be large, let's just query a small part if possible
    // Or if it's a huge array of objects, query all IDs.
    await read('{ id }')
  } catch (e) {
    console.error('Stress test error:', e)
  }

  console.log(`\nStress Test Completed in ${(Date.now() - start) / 1000}s`)
  console.log(`Total Matches: ${matches}`)
}

stressTest().catch(console.error)
