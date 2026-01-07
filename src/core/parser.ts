export interface DirectiveInfo {
  name: string
  args: any
}

export type SelectionMap = Record<
  string,
  | boolean
  | {
      selection?: SelectionMap
      directives?: DirectiveInfo[]
      alias?: string
    }
>

export class JQLParser {
  private pos = 0
  private schema: string

  constructor(schema: string) {
    this.schema = schema.trim()
  }

  public parse(): SelectionMap {
    if (!this.schema.startsWith('{')) {
      this.schema = `{ ${this.schema} }`
    }
    return this.parseObject()
  }

  private parseObject(): SelectionMap {
    const map: SelectionMap = {}
    this.consume('{')

    while (this.peek() !== '}' && this.pos < this.schema.length) {
      this.skipWhitespace()
      const identifier = this.readIdentifier()
      this.skipWhitespace()

      let targetKey = identifier
      let selection: any = true
      const directives: DirectiveInfo[] = []

      // Check for alias (alias: field)
      if (this.peek() === ':') {
        this.consume(':')
        const field = this.readIdentifier()
        const alias = identifier
        targetKey = field // the key we look for in JSON
        selection = { alias }
      }

      this.skipWhitespace()

      // Check for directives
      while (this.peek() === '@') {
        directives.push(this.parseDirective())
        this.skipWhitespace()
      }

      // Check for nested selection
      if (this.peek() === '{') {
        const nested = this.parseObject()
        if (typeof selection === 'boolean') {
          selection = { selection: nested }
        } else {
          selection.selection = nested
        }
      }

      if (directives.length > 0) {
        if (typeof selection === 'boolean') {
          selection = { directives }
        } else {
          selection.directives = directives
        }
      }

      map[targetKey] = selection

      this.skipWhitespace()
      if (this.peek() === ',') {
        this.consume(',')
      }
    }

    this.consume('}')
    return map
  }

  private parseDirective(): DirectiveInfo {
    this.consume('@')
    const name = this.readIdentifier()
    const args: any = {}

    if (this.peek() === '(') {
      this.consume('(')
      while (this.peek() !== ')' && this.pos < this.schema.length) {
        const argName = this.readIdentifier()
        this.consume(':')
        args[argName] = this.readArgumentValue()
        this.skipWhitespace()
        if (this.peek() === ',') this.consume(',')
      }
      this.consume(')')
    }

    return { name, args }
  }

  private readArgumentValue(): any {
    this.skipWhitespace()
    const char = this.peek()
    if (char === '"') {
      return this.readString()
    }
    // Simple numeric/boolean argument parsing
    const start = this.pos
    while (this.pos < this.schema.length && /[a-zA-Z0-9\._-]/.test(this.schema[this.pos])) {
      this.pos++
    }
    const val = this.schema.substring(start, this.pos)
    if (val === 'true') return true
    if (val === 'false') return false
    if (!isNaN(Number(val))) return Number(val)
    return val
  }

  private readString(): string {
    this.consume('"')
    const start = this.pos
    while (this.pos < this.schema.length && this.schema[this.pos] !== '"') {
      this.pos++
    }
    const str = this.schema.substring(start, this.pos)
    this.consume('"')
    return str
  }

  private readIdentifier(): string {
    this.skipWhitespace()
    const start = this.pos
    while (this.pos < this.schema.length && /[a-zA-Z0-9_]/.test(this.schema[this.pos])) {
      this.pos++
    }
    const id = this.schema.substring(start, this.pos)
    if (!id) throw new Error(`Expected identifier at ${this.pos}`)
    return id
  }

  private peek(): string {
    this.skipWhitespace()
    return this.schema[this.pos]
  }

  private consume(char: string) {
    this.skipWhitespace()
    if (this.schema[this.pos] !== char) {
      throw new Error(`Expected '${char}' at ${this.pos}, got '${this.schema[this.pos]}'`)
    }
    this.pos++
  }

  private skipWhitespace() {
    while (this.pos < this.schema.length && /\s/.test(this.schema[this.pos])) {
      this.pos++
    }
  }
}
