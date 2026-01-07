import { describe, expect, it } from 'vitest'
import { ndjsonStream } from '../adapters/ndjson'

describe('NDJSON Adapter', () => {
  it('should process multiple objects in an NDJSON stream', async () => {
    const lines = [
      JSON.stringify({ id: 1, name: 'Alice' }),
      JSON.stringify({ id: 2, name: 'Bob' }),
      JSON.stringify({ id: 3, name: 'Charlie' }),
    ].join('\n')

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(lines))
        controller.close()
      },
    })

    const results = []
    for await (const result of ndjsonStream(stream, '{ name }')) {
      results.push(result)
    }

    expect(results).toEqual([{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }])
  })

  it('should handle chunked NDJSON streams with cross-chunk lines', async () => {
    const part1 = '{"id": 1, "name": "Ali'
    const part2 = 'ce"}\n{"id": 2, "name": "Bob"}\n'

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(part1))
        controller.enqueue(new TextEncoder().encode(part2))
        controller.close()
      },
    })

    const results = []
    for await (const result of ndjsonStream(stream, '{ name }')) {
      results.push(result)
    }

    expect(results).toEqual([{ name: 'Alice' }, { name: 'Bob' }])
  })
})
