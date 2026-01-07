import { describe, expect, it } from 'vitest'
import { build, query } from '../runtime/index'

describe('JQL Public API', () => {
  const sample = {
    id: 1,
    name: 'Leanne Graham',
    email: 'Sincere@april.biz',
    address: {
      street: 'Kulas Light',
      city: 'Gwenborough',
    },
  }

  it('should work with build and read', async () => {
    const { read } = build(sample)
    const data = await read('{ name, email, address { street } }')

    expect(data).toEqual({
      name: 'Leanne Graham',
      email: 'Sincere@april.biz',
      address: {
        street: 'Kulas Light',
      },
    })
  })

  it('should work with query helper', async () => {
    const data = await query(sample, '{ email }')
    expect(data).toEqual({ email: 'Sincere@april.biz' })
  })

  it('should support TypeScript generics', async () => {
    interface User {
      name: string
      email: string
    }
    const data = await query<User>(sample, '{ name, email }')

    expect(data.name).toBe('Leanne Graham')
    expect(data.email).toBe('Sincere@april.biz')
  })

  it('should work with ReadableStream', async () => {
    const json = JSON.stringify(sample)
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode(json.substring(0, 10)))
        controller.enqueue(encoder.encode(json.substring(10)))
        controller.close()
      },
    })

    const { read } = build(stream)
    const data = await read('{ name }')
    expect(data).toEqual({ name: 'Leanne Graham' })
  })
})
