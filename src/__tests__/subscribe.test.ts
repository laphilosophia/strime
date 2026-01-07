import { describe, expect, it } from 'vitest'
import { subscribe } from '../runtime/subscribe'

describe('Strime Subscription (Push-Mode)', () => {
  it('should emit matches as soon as they are found in an array', async () => {
    const data = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(data)))
        controller.close()
      },
    })

    const matches: any[] = []
    return new Promise<void>((resolve, reject) => {
      subscribe(stream, '{ name }', {
        onMatch: (match) => {
          matches.push(match)
        },
        onComplete: () => {
          try {
            expect(matches).toEqual([{ name: 'Alice' }, { name: 'Bob' }])
            resolve()
          } catch (e) {
            reject(e)
          }
        },
        onError: reject,
      })
    })
  })
})
