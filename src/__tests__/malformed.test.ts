import { describe, expect, it } from 'vitest'
import { Engine } from '../core/engine'
import { JQLParser } from '../core/parser'

describe('Malformed JSON Handling', () => {
  it('should handle garbage between tokens', () => {
    const json = '{"name": !!! "Leanne Graham" !!!, "email": "Sincere@april.biz"}'
    const schema = '{ name, email }'
    const buffer = new TextEncoder().encode(json)
    const map = new JQLParser(schema).parse()
    const engine = new Engine(map)
    const result = engine.execute(buffer)

    expect(result).toEqual({
      name: 'Leanne Graham',
      email: 'Sincere@april.biz',
    })
  })

  it('should handle missing trailing braces (partial JSON)', () => {
    const json = '{"name": "Leanne Graham", "email": "Sincere@april.biz"' // Missing }
    const schema = '{ name, email }'
    const buffer = new TextEncoder().encode(json)
    const map = new JQLParser(schema).parse()
    const engine = new Engine(map)
    const result = engine.execute(buffer)

    // Should return what it found so far
    expect(result).toEqual({
      name: 'Leanne Graham',
      email: 'Sincere@april.biz',
    })
  })

  it('should handle invalid literals', () => {
    const json = '{"active": truX, "count": 10}'
    const schema = '{ active, count }'
    const buffer = new TextEncoder().encode(json)
    const map = new JQLParser(schema).parse()
    const engine = new Engine(map)

    expect(() => engine.execute(buffer)).toThrow(/Invalid literal/)
  })

  it('should handle unclosed strings', () => {
    const json = '{"name": "Unclosed string...'
    const schema = '{ name }'
    const buffer = new TextEncoder().encode(json)
    const map = new JQLParser(schema).parse()
    const engine = new Engine(map)
    const result = engine.execute(buffer)

    expect(result).toEqual({})
  })
})
