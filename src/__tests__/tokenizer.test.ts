import { describe, expect, it } from 'vitest'
import { Tokenizer, TokenType } from '../core/tokenizer'

describe('Tokenizer', () => {
  it('should tokenize a simple object', () => {
    const json = '{"a": 1, "b": true}'
    const buffer = new TextEncoder().encode(json)
    const tokenizer = new Tokenizer()

    const tokens: Array<{ type: TokenType; value?: unknown }> = []
    tokenizer.processChunk(buffer, (token) => {
      // Clone token because it's reused
      tokens.push({
        type: token.type,
        value: token.value,
      })
    })

    expect(tokens[0].type).toBe(TokenType.LEFT_BRACE)
    expect(tokens[1].type).toBe(TokenType.STRING) // "a"
    expect(tokens[1].value).toBe('a')
    expect(tokens[2].type).toBe(TokenType.COLON)
    expect(tokens[3].type).toBe(TokenType.NUMBER) // 1
    expect(tokens[3].value).toBe(1)
    expect(tokens[4].type).toBe(TokenType.COMMA)
    expect(tokens[5].type).toBe(TokenType.STRING) // "b"
    expect(tokens[6].type).toBe(TokenType.COLON)
    expect(tokens[7].type).toBe(TokenType.TRUE)
    expect(tokens[8].type).toBe(TokenType.RIGHT_BRACE)
  })

  it('should handle chunked data', () => {
    const tokenizer = new Tokenizer()
    const chunk1 = new TextEncoder().encode('{"name": "Leanne')
    const chunk2 = new TextEncoder().encode(' Graham"}')

    const tokens1: Array<{ type: TokenType }> = []
    tokenizer.processChunk(chunk1, (token) => {
      tokens1.push({ type: token.type })
    })
    expect(tokens1).toHaveLength(3) // {, "name", :

    const tokens2: Array<{ type: TokenType; value?: unknown }> = []
    tokenizer.processChunk(chunk2, (token) => {
      tokens2.push({ type: token.type, value: token.value })
    })
    expect(tokens2).toHaveLength(2) // "Leanne Graham", }
    expect(tokens2[0].value).toBe('Leanne Graham')
  })
})
