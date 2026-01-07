import { describe, expect, it } from 'vitest'
import { JQLParser } from '../core/parser'

describe('JQLParser', () => {
  it('should parse a simple schema', () => {
    const schema = '{ name, email }'
    const parser = new JQLParser(schema)
    const result = parser.parse()

    expect(result).toEqual({
      name: true,
      email: true,
    })
  })

  it('should parse a nested schema', () => {
    const schema = '{ name, address { street, city } }'
    const parser = new JQLParser(schema)
    const result = parser.parse()

    expect(result).toEqual({
      name: true,
      address: {
        selection: {
          street: true,
          city: true,
        },
      },
    })
  })

  it('should parse schema without outer braces', () => {
    const schema = 'name, email'
    const parser = new JQLParser(schema)
    const result = parser.parse()

    expect(result).toEqual({
      name: true,
      email: true,
    })
  })
})
