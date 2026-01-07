import { describe, expect, it } from 'vitest'
import { StrimeParser } from '../core/parser'

describe('StrimeParser', () => {
  it('should parse a simple schema', () => {
    const schema = '{ name, email }'
    const parser = new StrimeParser(schema)
    const result = parser.parse()

    expect(result).toEqual({
      name: true,
      email: true,
    })
  })

  it('should parse a nested schema', () => {
    const schema = '{ name, address { street, city } }'
    const parser = new StrimeParser(schema)
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
    const parser = new StrimeParser(schema)
    const result = parser.parse()

    expect(result).toEqual({
      name: true,
      email: true,
    })
  })
})
