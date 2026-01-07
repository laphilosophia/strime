import { describe, expect, it } from 'vitest'
import { Engine } from '../core/engine'
import { FanOutLimitError } from '../core/fan-out-guard'
import { StrimeParser } from '../core/parser'

const parse = (query: string) => new StrimeParser(query).parse()

describe('Fan-out Guardrails', () => {
  describe('Depth Limits', () => {
    it('should allow structures within depth limit', () => {
      const json = '{"a": {"b": {"c": 1}}}'
      const buffer = new TextEncoder().encode(json)
      const selection = parse('{ a { b { c } } }')

      const engine = new Engine(selection, {
        fanOutLimits: { maxDepth: 5 },
      })

      const result = engine.execute(buffer)
      expect(result).toEqual({ a: { b: { c: 1 } } })
    })

    it('should throw FanOutLimitError when depth exceeds limit', () => {
      const json = '{"a": {"b": {"c": {"d": {"e": {"f": 1}}}}}}'
      const buffer = new TextEncoder().encode(json)
      const selection = parse('{ a { b { c { d { e { f } } } } } }')

      const engine = new Engine(selection, {
        fanOutLimits: { maxDepth: 3 },
      })

      expect(() => engine.execute(buffer)).toThrow(FanOutLimitError)
    })

    it('should include error details in FanOutLimitError', () => {
      const json = '{"a": {"b": {"c": {"d": 1}}}}'
      const buffer = new TextEncoder().encode(json)
      const selection = parse('{ a { b { c { d } } } }')

      const engine = new Engine(selection, {
        fanOutLimits: { maxDepth: 2 },
      })

      try {
        engine.execute(buffer)
        expect.fail('Should have thrown')
      } catch (e) {
        const error = e as FanOutLimitError
        expect(error.code).toBe('ERR_Strime_FANOUT_DEPTH')
        expect(error.limit).toBe(2)
        expect(error.actual).toBeGreaterThan(2)
      }
    })
  })

  describe('Default Limits', () => {
    it('should work without fanOutLimits (no guard active)', () => {
      const json = '{"a": {"b": {"c": {"d": {"e": {"f": {"g": 1}}}}}}}'
      const buffer = new TextEncoder().encode(json)
      const selection = parse('{ a }')

      const engine = new Engine(selection) // No limits

      const result = engine.execute(buffer)
      expect(result.a).toBeDefined()
    })
  })

  describe('Production Use Case - DoS Protection', () => {
    it('should protect against DoS via unmatched deep nesting', () => {
      // Key test: selection only matches top level, but JSON is deeply nested
      // Guard should still protect against malicious payloads
      let json = '{"level0":'
      for (let i = 1; i <= 150; i++) {
        json += `{"level${i}":`
      }
      json += '1'
      for (let i = 0; i <= 150; i++) {
        json += '}'
      }

      const buffer = new TextEncoder().encode(json)
      const selection = parse('{ level0 }') // Only matches top level

      const engine = new Engine(selection, {
        fanOutLimits: { maxDepth: 100 }, // Conservative limit
      })

      // Even though selection doesn't match deep levels,
      // the guard should still prevent DoS
      expect(() => engine.execute(buffer)).toThrow(FanOutLimitError)
    })
  })
})
