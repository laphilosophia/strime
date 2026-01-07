import { AbortError, TokenizationError } from './errors'

export enum TokenType {
  LEFT_BRACE,
  RIGHT_BRACE,
  LEFT_BRACKET,
  RIGHT_BRACKET,
  COLON,
  COMMA,
  STRING,
  NUMBER,
  TRUE,
  FALSE,
  NULL,
  EOF,
}

export interface Token {
  type: TokenType
  value?: unknown
  start: number
  end: number
}

export class Tokenizer {
  private state: 'IDLE' | 'STRING' | 'STRING_ESCAPE' | 'NUMBER' | 'LITERAL' = 'IDLE'
  private buffer = new Uint8Array(65536)
  private bufferOffset = 0
  private literalTarget = ''
  private literalType: TokenType = TokenType.NULL
  private pos = 0
  private startPos = 0
  private decoder = new TextDecoder()
  private stringCache = new Map<string, string>()
  private reusableToken: Token = { type: TokenType.NULL, start: 0, end: 0 }

  private debug = false
  private signal?: AbortSignal
  private aborted = false

  constructor(
    private source?: Uint8Array,
    options?: { debug?: boolean; signal?: AbortSignal }
  ) {
    this.debug = options?.debug ?? false
    this.signal = options?.signal
    if (this.signal) {
      if (this.signal.aborted) {
        this.aborted = true
      } else {
        this.signal.addEventListener(
          'abort',
          () => {
            this.aborted = true
          },
          { once: true }
        )
      }
    }
  }

  public reset() {
    this.state = 'IDLE'
    this.bufferOffset = 0
    this.pos = 0
    this.startPos = 0
  }

  /**
   * Process a chunk of JSON data using callback pattern.
   *
   * This is the high-performance API optimized for streaming with zero allocation.
   * The token object passed to the callback is reused for performance - if you need
   * to store tokens, you must clone them.
   *
   * @param chunk - Uint8Array containing JSON data to process
   * @param onToken - Callback invoked for each token
   */
  public processChunk(
    chunk: Uint8Array,
    onToken: (token: Token) => void,
    check?: () => void
  ): void {
    const len = chunk.length
    // Fast path: check once per chunk
    if (this.aborted) throw new AbortError()

    for (let i = 0; i < len; i++) {
      if ((i & 32767) === 0) {
        if (this.aborted) throw new AbortError()
        check?.()
      }

      const byte = chunk[i]
      const currentPos = this.pos
      this.pos++

      if (this.state === 'IDLE') {
        switch (byte) {
          case 123:
            this.emit(TokenType.LEFT_BRACE, currentPos, this.pos, onToken)
            break
          case 125:
            this.emit(TokenType.RIGHT_BRACE, currentPos, this.pos, onToken)
            break
          case 91:
            this.emit(TokenType.LEFT_BRACKET, currentPos, this.pos, onToken)
            break
          case 93:
            this.emit(TokenType.RIGHT_BRACKET, currentPos, this.pos, onToken)
            break
          case 58:
            this.emit(TokenType.COLON, currentPos, this.pos, onToken)
            break
          case 44:
            this.emit(TokenType.COMMA, currentPos, this.pos, onToken)
            break
          case 34: // "
            this.state = 'STRING'
            this.bufferOffset = 0
            this.startPos = currentPos
            break
          case 116:
            this.startLiteral('true', TokenType.TRUE, byte, currentPos)
            break
          case 102:
            this.startLiteral('false', TokenType.FALSE, byte, currentPos)
            break
          case 110:
            this.startLiteral('null', TokenType.NULL, byte, currentPos)
            break
          case 32:
          case 9:
          case 10:
          case 13:
            break // Whitespace
          default:
            if ((byte >= 48 && byte <= 57) || byte === 45) {
              this.state = 'NUMBER'
              this.buffer[0] = byte
              this.bufferOffset = 1
              this.startPos = currentPos
            }
            break
        }
      } else if (this.state === 'STRING') {
        if (byte === 34) {
          this.emit(TokenType.STRING, this.startPos, this.pos, onToken, this.decodeBuffer())
          this.state = 'IDLE'
        } else if (byte === 92) {
          this.state = 'STRING_ESCAPE'
        } else {
          this.buffer[this.bufferOffset++] = byte
        }
      } else if (this.state === 'STRING_ESCAPE') {
        this.buffer[this.bufferOffset++] = byte
        this.state = 'STRING'
      } else if (this.state === 'NUMBER') {
        if (
          (byte >= 48 && byte <= 57) ||
          byte === 46 ||
          byte === 101 ||
          byte === 69 ||
          byte === 45 ||
          byte === 43
        ) {
          this.buffer[this.bufferOffset++] = byte
        } else {
          const val = this.parseNumber()
          this.emit(TokenType.NUMBER, this.startPos, currentPos, onToken, val)
          this.state = 'IDLE'
          i--
          this.pos--
        }
      } else if (this.state === 'LITERAL') {
        this.buffer[this.bufferOffset++] = byte
        if (this.bufferOffset === this.literalTarget.length) {
          const actual = this.decodeBuffer()
          if (actual === this.literalTarget) {
            this.emit(this.literalType, this.startPos, this.pos, onToken)
            this.state = 'IDLE'
          } else {
            throw new TokenizationError(
              `Invalid literal: expected '${this.literalTarget}', got '${actual}'`,
              this.startPos
            )
          }
        }
      }
    }
  }

  private emit(
    type: TokenType,
    start: number,
    end: number,
    onToken: (t: Token) => void,
    value?: unknown
  ): void {
    this.reusableToken.type = type
    this.reusableToken.start = start
    this.reusableToken.end = end
    this.reusableToken.value = value
    onToken(this.reusableToken)
  }

  private parseNumber(): number {
    const len = this.bufferOffset
    // Fast path for positive integers
    let res = 0
    let isSimple = true
    for (let i = 0; i < len; i++) {
      const b = this.buffer[i]
      if (b >= 48 && b <= 57) {
        res = res * 10 + (b - 48)
      } else {
        isSimple = false
        break
      }
    }
    if (isSimple) return res
    return parseFloat(this.decoder.decode(this.buffer.subarray(0, len)))
  }

  /**
   * Process chunk and yield tokens as an iterator.
   */
  public *tokenize(chunk: Uint8Array): Generator<Token, void, undefined> {
    const len = chunk.length
    if (this.aborted) throw new AbortError()

    for (let i = 0; i < len; i++) {
      if ((i & 32767) === 0) {
        if (this.aborted) throw new AbortError()
      }

      const byte = chunk[i]
      const currentPos = this.pos
      this.pos++

      if (this.state === 'IDLE') {
        switch (byte) {
          case 123:
            yield this.createToken(TokenType.LEFT_BRACE, currentPos, this.pos)
            break
          case 125:
            yield this.createToken(TokenType.RIGHT_BRACE, currentPos, this.pos)
            break
          case 91:
            yield this.createToken(TokenType.LEFT_BRACKET, currentPos, this.pos)
            break
          case 93:
            yield this.createToken(TokenType.RIGHT_BRACKET, currentPos, this.pos)
            break
          case 58:
            yield this.createToken(TokenType.COLON, currentPos, this.pos)
            break
          case 44:
            yield this.createToken(TokenType.COMMA, currentPos, this.pos)
            break
          case 34:
            this.state = 'STRING'
            this.bufferOffset = 0
            this.startPos = currentPos
            break
          case 116:
            this.startLiteral('true', TokenType.TRUE, byte, currentPos)
            break
          case 102:
            this.startLiteral('false', TokenType.FALSE, byte, currentPos)
            break
          case 110:
            this.startLiteral('null', TokenType.NULL, byte, currentPos)
            break
          case 32:
          case 9:
          case 10:
          case 13:
            break
          default:
            if ((byte >= 48 && byte <= 57) || byte === 45) {
              this.state = 'NUMBER'
              this.buffer[0] = byte
              this.bufferOffset = 1
              this.startPos = currentPos
            }
            break
        }
      } else if (this.state === 'STRING') {
        if (byte === 34) {
          yield this.createToken(TokenType.STRING, this.startPos, this.pos, this.decodeBuffer())
          this.state = 'IDLE'
        } else if (byte === 92) {
          this.state = 'STRING_ESCAPE'
        } else {
          this.buffer[this.bufferOffset++] = byte
        }
      } else if (this.state === 'STRING_ESCAPE') {
        this.buffer[this.bufferOffset++] = byte
        this.state = 'STRING'
      } else if (this.state === 'NUMBER') {
        if (
          (byte >= 48 && byte <= 57) ||
          byte === 46 ||
          byte === 101 ||
          byte === 69 ||
          byte === 45 ||
          byte === 43
        ) {
          this.buffer[this.bufferOffset++] = byte
        } else {
          const val = this.parseNumber()
          yield this.createToken(TokenType.NUMBER, this.startPos, currentPos, val)
          this.state = 'IDLE'
          i--
          this.pos--
        }
      } else if (this.state === 'LITERAL') {
        this.buffer[this.bufferOffset++] = byte
        if (this.bufferOffset === this.literalTarget.length) {
          const actual = this.decodeBuffer()
          if (actual === this.literalTarget) {
            yield this.createToken(this.literalType, this.startPos, this.pos)
            this.state = 'IDLE'
          } else {
            throw new TokenizationError(
              `Invalid literal: expected '${this.literalTarget}', got '${actual}'`,
              this.startPos
            )
          }
        }
      }
    }
  }

  public nextToken(): Token {
    return { type: TokenType.EOF, start: this.pos, end: this.pos }
  }

  private createToken(type: TokenType, start: number, end: number, value?: unknown): Token {
    return { type, start, end, value }
  }

  private startLiteral(target: string, type: TokenType, firstByte: number, startPos: number) {
    this.state = 'LITERAL'
    this.literalTarget = target
    this.literalType = type
    this.buffer[0] = firstByte
    this.bufferOffset = 1
    this.startPos = startPos
  }

  private decodeBuffer(): string {
    const len = this.bufferOffset
    if (len === 0) return ''
    if (len < 32) {
      let cacheKey = ''
      for (let i = 0; i < len; i++) {
        cacheKey += String.fromCharCode(this.buffer[i])
      }
      const cached = this.stringCache.get(cacheKey)
      if (cached !== undefined) return cached
      if (this.stringCache.size < 500) {
        this.stringCache.set(cacheKey, cacheKey)
      }
      return cacheKey
    }
    return this.decoder.decode(this.buffer.subarray(0, len))
  }
}
