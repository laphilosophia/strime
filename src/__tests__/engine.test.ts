import { describe, expect, it } from 'vitest'
import { Engine } from '../core/engine'
import { StrimeParser } from '../core/parser'

describe('Engine', () => {
  it('should query a simple object', () => {
    const json = '{"name": "Leanne Graham", "email": "Sincere@april.biz", "phone": "123"}'
    const schema = '{ name, email }'

    const buffer = new TextEncoder().encode(json)
    const map = new StrimeParser(schema).parse()

    const engine = new Engine(map)
    const result = engine.execute(buffer)

    expect(result).toEqual({
      name: 'Leanne Graham',
      email: 'Sincere@april.biz',
    })
    expect(result.phone).toBeUndefined()
  })

  it('should query a nested object', () => {
    const json = JSON.stringify({
      id: 1,
      name: 'Leanne Graham',
      address: {
        street: 'Kulas Light',
        city: 'Gwenborough',
        zipcode: '92998',
      },
    })
    const schema = '{ name, address { street, city } }'

    const buffer = new TextEncoder().encode(json)
    const map = new StrimeParser(schema).parse()
    const engine = new Engine(map)
    const result = engine.execute(buffer)

    expect(result).toEqual({
      name: 'Leanne Graham',
      address: {
        street: 'Kulas Light',
        city: 'Gwenborough',
      },
    })
    expect(result.address.zipcode).toBeUndefined()
  })

  it('should handle arrays', () => {
    const json = JSON.stringify({
      users: [
        { id: 1, name: 'A', active: true },
        { id: 2, name: 'B', active: false },
      ],
    })
    const schema = '{ users { name } }'

    const buffer = new TextEncoder().encode(json)
    const map = new StrimeParser(schema).parse()
    const engine = new Engine(map)
    const result = engine.execute(buffer)

    expect(result).toEqual({
      users: [{ name: 'A' }, { name: 'B' }],
    })
  })

  describe('executeChunked', () => {
    it('should produce identical results to execute()', () => {
      const json = JSON.stringify({
        id: 1,
        name: 'Test User',
        metadata: { a: 1, b: 2, c: 3, d: 4, e: 5 },
        tags: ['one', 'two', 'three'],
      })
      const schema = '{ name, tags }'

      const buffer = new TextEncoder().encode(json)
      const map = new StrimeParser(schema).parse()

      const engine1 = new Engine(map)
      const result1 = engine1.execute(buffer)

      const engine2 = new Engine(map)
      const result2 = engine2.executeChunked(buffer, 16) // Very small chunks

      expect(result2).toEqual(result1)
    })

    it('should handle chunk boundaries mid-string', () => {
      // Create a string that will definitely be split across chunks
      const longValue = 'A'.repeat(100)
      const json = JSON.stringify({ key: longValue, other: 'ignored' })
      const schema = '{ key }'

      const buffer = new TextEncoder().encode(json)
      const map = new StrimeParser(schema).parse()
      const engine = new Engine(map)

      // Use 32-byte chunks to split the string
      const result = engine.executeChunked(buffer, 32)

      expect(result).toEqual({ key: longValue })
    })

    it('should handle skipped structures across chunk boundaries', () => {
      const json = JSON.stringify({
        wanted: 'keep',
        skipped: { nested: { deep: { value: Array(50).fill('x') } } },
      })
      const schema = '{ wanted }'

      const buffer = new TextEncoder().encode(json)
      const map = new StrimeParser(schema).parse()
      const engine = new Engine(map)

      // Small chunks to ensure skip spans multiple
      const result = engine.executeChunked(buffer, 64)

      expect(result).toEqual({ wanted: 'keep' })
    })

    it('should enforce minimum chunk size', () => {
      const json = '{"a":1}'
      const buffer = new TextEncoder().encode(json)
      const map = new StrimeParser('{ a }').parse()
      const engine = new Engine(map)

      // Even with tiny chunkSize, should work (min enforced internally)
      const result = engine.executeChunked(buffer, 1)
      expect(result).toEqual({ a: 1 })
    })
  })
})
