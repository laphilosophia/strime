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
  EOF
}

export interface Token {
  type: TokenType;
  value?: any;
  start: number;
  end: number;
}

export class Tokenizer {
  private state: 'IDLE' | 'STRING' | 'STRING_ESCAPE' | 'NUMBER' | 'LITERAL' = 'IDLE';
  private buffer: number[] = [];
  private literalTarget: string = '';
  private literalType: TokenType = TokenType.NULL;
  private pos = 0;
  private startPos = 0;

  private debug = false;

  constructor(private source?: Uint8Array, options?: { debug?: boolean }) {
    this.debug = options?.debug ?? false;
  }

  private trace(msg: string) {
    if (this.debug) console.log(`[Tokenizer] ${msg}`);
  }

  public reset() {
    this.state = 'IDLE';
    this.buffer = [];
    this.pos = 0;
    this.startPos = 0;
  }

  public *processChunk(chunk: Uint8Array): Generator<Token> {
    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i];
      const currentPos = this.pos;
      this.pos++;

      if (this.state === 'IDLE') {
        this.trace(`IDLE: 0x${byte.toString(16)} at ${currentPos}`);
        switch (byte) {
          case 123: yield { type: TokenType.LEFT_BRACE, start: currentPos, end: this.pos }; break;
          case 125: yield { type: TokenType.RIGHT_BRACE, start: currentPos, end: this.pos }; break;
          case 91: yield { type: TokenType.LEFT_BRACKET, start: currentPos, end: this.pos }; break;
          case 93: yield { type: TokenType.RIGHT_BRACKET, start: currentPos, end: this.pos }; break;
          case 58: yield { type: TokenType.COLON, start: currentPos, end: this.pos }; break;
          case 44: yield { type: TokenType.COMMA, start: currentPos, end: this.pos }; break;
          case 34: // "
            this.state = 'STRING';
            this.buffer = [];
            this.startPos = currentPos;
            break;
          case 116: this.startLiteral('true', TokenType.TRUE, byte, currentPos); break;
          case 102: this.startLiteral('false', TokenType.FALSE, byte, currentPos); break;
          case 110: this.startLiteral('null', TokenType.NULL, byte, currentPos); break;
          default:
            if ((byte >= 48 && byte <= 57) || byte === 45) {
              this.state = 'NUMBER';
              this.buffer = [byte];
              this.startPos = currentPos;
            }
            break;
        }
      } else if (this.state === 'STRING') {
        if (byte === 34) {
          yield { type: TokenType.STRING, value: this.decodeBuffer(), start: this.startPos, end: this.pos };
          this.state = 'IDLE';
        } else if (byte === 92) {
          this.state = 'STRING_ESCAPE';
        } else {
          this.buffer.push(byte);
        }
      } else if (this.state === 'STRING_ESCAPE') {
        this.buffer.push(byte);
        this.state = 'STRING';
      } else if (this.state === 'NUMBER') {
        if ((byte >= 48 && byte <= 57) || byte === 46 || byte === 101 || byte === 69 || byte === 45 || byte === 43) {
          this.buffer.push(byte);
        } else {
          yield { type: TokenType.NUMBER, value: parseFloat(this.decodeBuffer()), start: this.startPos, end: currentPos };
          this.state = 'IDLE';
          i--;
          this.pos--; // Re-process
        }
      } else if (this.state === 'LITERAL') {
        this.buffer.push(byte);
        if (this.buffer.length === this.literalTarget.length) {
          const actual = this.decodeBuffer();
          if (actual === this.literalTarget) {
            yield { type: this.literalType, start: this.startPos, end: this.pos };
            this.state = 'IDLE';
          } else {
            throw new Error(`Invalid literal: expected ${this.literalTarget}, got ${actual} at position ${this.startPos}`);
          }
        }
      }
    }
  }

  // Compat
  public nextToken(): Token {
    return { type: TokenType.EOF, start: this.pos, end: this.pos };
  }

  private startLiteral(target: string, type: TokenType, firstByte: number, startPos: number) {
    this.state = 'LITERAL';
    this.literalTarget = target;
    this.literalType = type;
    this.buffer = [firstByte];
    this.startPos = startPos;
  }

  private decodeBuffer(): string {
    return String.fromCharCode(...this.buffer);
  }
}
