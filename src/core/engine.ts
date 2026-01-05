import { DirectiveRegistry } from './directives'
import { BudgetExhaustedError, StructuralMismatchError } from './errors'
import { SelectionMap } from './parser'
import { JQLStats, OutputSink } from './sink'
import { Token, Tokenizer, TokenType } from './tokenizer'

export class Engine {
  private tokenizer = new Tokenizer()
  private selectionStack: (boolean | any)[] = []
  private resultStack: any[] = []
  private keyStack: (string | null)[] = []

  private currentKey: string | null = null
  private skipDepth = 0
  private isArrayStack: boolean[] = []
  private sink?: OutputSink
  private debug = false
  private finalResult: any = undefined

  private matchedCount = 0
  private processedBytes = 0
  private startTime = 0
  private skipStartTime = 0
  private totalSkipTime = 0
  private budget?: { maxMatches?: number; maxBytes?: number; maxDurationMs?: number }
  private emitMode: 'object' | 'raw' = 'object'
  private matchStartPos: number = 0
  private rawBuffer: Uint8Array[] = []
  private isCapturing = false
  private firstMatchChunk: Uint8Array | null = null
  private firstMatchChunkPos: number = 0

  constructor(
    private initialSelection: SelectionMap,
    options?: {
      debug?: boolean
      onMatch?: (data: any) => void
      sink?: OutputSink
      signal?: AbortSignal
      budget?: { maxMatches?: number; maxBytes?: number; maxDurationMs?: number }
      emitMode?: 'object' | 'raw'
    }
  ) {
    this.debug = options?.debug ?? false
    this.sink = options?.sink || (options?.onMatch ? { onMatch: options.onMatch } : undefined)
    this.budget = options?.budget
    this.emitMode = options?.emitMode ?? 'object'
    this.tokenizer = new Tokenizer(undefined, options)
    this.selectionStack.push({ selection: initialSelection })
    this.startTime = performance.now()
  }

  private trace(msg: string) {
    if (this.debug) console.log(`[Engine] ${msg}`)
  }

  public reset() {
    this.tokenizer.reset()
    this.selectionStack = [{ selection: this.initialSelection }]
    this.resultStack = []
    this.keyStack = []
    this.currentKey = null
    this.skipDepth = 0
    this.isArrayStack = []
    this.finalResult = undefined
  }

  public execute(source: Uint8Array): any {
    const startMatches = this.matchedCount
    this.processChunk(source)
    const result = this.getResult()

    // Root result emission is now handled by onStructureEnd during processChunk.
    if (this.sink?.onStats) {
      this.sink.onStats(this.getStats())
    }
    return result
  }

  private currentChunk: Uint8Array | null = null

  public processChunk(chunk: Uint8Array) {
    this.processedBytes += chunk.length
    this.currentChunk = chunk

    this.enforceBudget()

    if (this.emitMode === 'raw' && this.isCapturing) {
      this.rawBuffer.push(new Uint8Array(chunk))
    }

    this.tokenizer.processChunk(
      chunk,
      (token) => {
        this.handleToken(token)
      },
      () => {
        this.enforceBudget()
      }
    )
  }

  private enforceBudget() {
    if (this.budget) {
      if (this.budget.maxMatches && this.matchedCount > this.budget.maxMatches) {
        throw new BudgetExhaustedError(`Match limit exceeded: ${this.budget.maxMatches}`, 'MATCHES')
      }
      if (this.budget.maxBytes && this.processedBytes > this.budget.maxBytes) {
        throw new BudgetExhaustedError(`Byte limit exceeded: ${this.budget.maxBytes}`, 'BYTES')
      }
      const now = performance.now()
      if (this.budget.maxDurationMs && now - this.startTime > this.budget.maxDurationMs) {
        throw new BudgetExhaustedError(
          `Duration limit exceeded: ${this.budget.maxDurationMs}ms`,
          'DURATION'
        )
      }
    }
  }

  public getStats(): JQLStats {
    const duration = performance.now() - this.startTime
    const skipTime =
      this.totalSkipTime + (this.skipDepth > 0 ? performance.now() - this.skipStartTime : 0)

    return {
      matchedCount: this.matchedCount,
      processedBytes: this.processedBytes,
      durationMs: duration,
      throughputMbps: (this.processedBytes * 8) / (Math.max(1, duration) * 1000), // Mbps
      skipRatio: skipTime / Math.max(1, duration),
    }
  }

  public getResult(): any {
    return this.finalResult !== undefined ? this.finalResult : this.resultStack[0]
  }

  private handleToken(token: Token) {
    if (this.skipDepth > 0) {
      if (token.type === TokenType.LEFT_BRACE || token.type === TokenType.LEFT_BRACKET) {
        this.skipDepth++
      } else if (token.type === TokenType.RIGHT_BRACE || token.type === TokenType.RIGHT_BRACKET) {
        this.skipDepth--
        if (this.skipDepth === 0) {
          this.totalSkipTime += performance.now() - this.skipStartTime
          this.onStructureEnd(token.end)
        }
      }
      return
    }

    switch (token.type) {
      case TokenType.LEFT_BRACE:
        this.onStructureStart(false, token.start)
        break
      case TokenType.RIGHT_BRACE:
        this.onStructureEnd(token.end)
        break
      case TokenType.LEFT_BRACKET:
        this.onStructureStart(true, token.start)
        break
      case TokenType.RIGHT_BRACKET:
        this.onStructureEnd(token.end)
        break
      case TokenType.STRING:
        if (this.expectingKey()) {
          this.currentKey = token.value as string
        } else {
          if (this.emitMode === 'raw' && !this.isCapturing && this.expectingMatch()) {
            this.startRawCapture(token.start)
          }
          this.onValue(token.value, token.end)
        }
        break
      case TokenType.NUMBER:
      case TokenType.TRUE:
      case TokenType.FALSE:
      case TokenType.NULL:
        if (this.emitMode === 'raw' && !this.isCapturing && this.expectingMatch()) {
          this.startRawCapture(token.start)
        }
        this.onValue(token.value ?? this.getLiteralValue(token.type), token.end)
        break
    }
  }

  private expectingMatch(): boolean {
    const parent = this.selectionStack[this.selectionStack.length - 1]
    if (this.isArrayStack.length === 0) return true // Root
    if (this.isArray()) return true // Array element
    if (this.currentKey && parent && parent.selection && parent.selection[this.currentKey])
      return true
    return false
  }

  private startRawCapture(pos: number) {
    this.isCapturing = true
    this.matchStartPos = pos
    this.rawBuffer = []
    if (this.currentChunk) {
      this.firstMatchChunk = this.currentChunk
      this.firstMatchChunkPos = this.processedBytes - this.currentChunk.length
    }
  }

  private expectingKey(): boolean {
    return !this.isArray() && this.currentKey === null
  }

  private isArray(): boolean {
    return this.isArrayStack[this.isArrayStack.length - 1] || false
  }

  private onStructureStart(isArray: boolean, startPos?: number) {
    if (this.emitMode === 'raw' && !this.isCapturing && this.expectingMatch()) {
      // For raw mode, we capture items of root array OR the root object itself
      // If we are at depth 0, it's either the root object or root array.
      if (this.isArrayStack.length === 0) {
        // If it's the root array, we don't capture the array itself, but its elements.
        // If it's the root object, we capture the object.
        if (!isArray) this.startRawCapture(startPos!)
      } else {
        // Nested match
        this.startRawCapture(startPos!)
      }
    }

    const parent = this.selectionStack[this.selectionStack.length - 1]
    let currentSelection: any = false
    let targetKey = this.currentKey

    if (this.isArrayStack.length === 0) {
      currentSelection = parent
      this.resultStack.push(isArray ? [] : {})
    } else if (this.isArray()) {
      const parentResult = this.resultStack[this.resultStack.length - 1]
      if (!Array.isArray(parentResult)) {
        throw new StructuralMismatchError(`Expected array at depth ${this.resultStack.length}`)
      }
      currentSelection = parent
      const newObj = isArray ? [] : {}
      parentResult.push(newObj)
      this.resultStack.push(newObj)
    } else if (this.currentKey && parent && parent.selection && parent.selection[this.currentKey]) {
      const config = parent.selection[this.currentKey]
      currentSelection = typeof config === 'boolean' ? { selection: {} } : config
      targetKey = currentSelection.alias || this.currentKey

      if (currentSelection) {
        const parentResult = this.resultStack[this.resultStack.length - 1]
        if (
          typeof parentResult !== 'object' ||
          parentResult === null ||
          Array.isArray(parentResult)
        ) {
          throw new StructuralMismatchError(
            `Expected object at depth ${this.resultStack.length} for key '${targetKey}'`
          )
        }
        const newObj = isArray ? [] : {}
        parentResult[targetKey!] = newObj
        this.resultStack.push(newObj)
      } else {
        if (this.skipDepth === 0) this.skipStartTime = performance.now()
        this.skipDepth = 1
      }
    } else {
      if (this.skipDepth === 0) this.skipStartTime = performance.now()
      this.skipDepth = 1
    }

    this.selectionStack.push(currentSelection)
    this.isArrayStack.push(isArray)
    this.keyStack.push(targetKey)
    this.currentKey = null
  }

  private onStructureEnd(endPos?: number) {
    const selection = this.selectionStack.pop()
    const wasArray = this.isArrayStack[this.isArrayStack.length - 1] || false
    this.isArrayStack.pop()
    if (selection !== false && !this.isArray() && selection.selection) {
      const result = this.resultStack[this.resultStack.length - 1]
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        for (const [key, config] of Object.entries(selection.selection)) {
          const conf = config as any
          const targetKey = conf.alias || key
          if (!(targetKey in result)) {
            if (conf.directives) {
              const defaultValue = this.applyDirectives(undefined, conf.directives)
              if (defaultValue !== undefined) {
                result[targetKey] = defaultValue
              }
            }
          }
        }
      }
    }

    if (selection !== false) {
      if (this.resultStack.length === 1 && this.isArrayStack.length === 0 && !wasArray) {
        // Root object completion
        const finishedItem = this.resultStack.pop()
        this.matchedCount++
        this.enforceBudget()
        if (this.emitMode === 'raw' && this.isCapturing) {
          const raw = this.assembleRaw(endPos!)
          this.sink?.onRawMatch?.(raw)
          this.isCapturing = false
        }
        this.finalResult = finishedItem
        if (this.emitMode === 'object') {
          this.sink?.onMatch?.(finishedItem)
        }
      } else if (this.resultStack.length === 1 && this.isArrayStack.length === 0 && wasArray) {
        // Root array ended - only store final result, don't emit as match
        // to avoid double emission (individual items were already emitted)
        this.finalResult = this.resultStack.pop()
      } else if (this.resultStack.length > 1) {
        const finishedItem = this.resultStack.pop()
        // If we are at depth 1 (root array item completion), emit match
        if (this.resultStack.length === 1 && this.isArrayStack[0]) {
          this.matchedCount++
          this.enforceBudget()
          if (this.emitMode === 'raw' && this.isCapturing) {
            const raw = this.assembleRaw(endPos!)
            this.sink?.onRawMatch?.(raw)
            this.isCapturing = false
          }
          if (this.emitMode === 'object') {
            this.sink?.onMatch?.(finishedItem)
          }
        }
      }
    }
    this.keyStack.pop()
    this.currentKey = null
  }

  private onValue(value: any, endPos?: number) {
    if (this.emitMode === 'raw' && !this.isCapturing && this.expectingMatch()) {
      // Single value match (e.g. querying a number or string directly)
      // This is rare but possible in JQL.
      // We'll treat it as a match if it's the root.
    }

    const parent = this.selectionStack[this.selectionStack.length - 1]

    if (this.isArray()) {
      const parentResult = this.resultStack[this.resultStack.length - 1]
      if (!Array.isArray(parentResult)) {
        throw new StructuralMismatchError(
          `Expected array at depth ${this.resultStack.length} for value`
        )
      }
      // For arrays, if selection is boolean true or an object with no explicit fields but maybe directives
      if (parent.selection || parent === true || parent.directives) {
        parentResult.push(this.applyDirectives(value, parent.directives))
      }
    } else if (this.currentKey && parent.selection && parent.selection[this.currentKey]) {
      const parentResult = this.resultStack[this.resultStack.length - 1]
      if (
        typeof parentResult !== 'object' ||
        parentResult === null ||
        Array.isArray(parentResult)
      ) {
        throw new StructuralMismatchError(
          `Expected object at depth ${this.resultStack.length} for key '${this.currentKey}'`
        )
      }
      const config = parent.selection[this.currentKey]
      const targetKey = config.alias || this.currentKey
      const finalValue = this.applyDirectives(value, config.directives)
      parentResult[targetKey] = finalValue
      if (this.resultStack.length === 1) {
        this.matchedCount++
        this.enforceBudget()
        this.sink?.onMatch?.(finalValue)
      }
    }

    this.currentKey = null
  }

  private applyDirectives(value: any, directives?: any[]): any {
    if (!directives) return value
    let result = value
    for (const d of directives) {
      result = DirectiveRegistry.execute(d.name, result, d.args)
    }
    return result
  }

  private assembleRaw(endPos: number): Uint8Array {
    const totalLen = endPos - this.matchStartPos
    const result = new Uint8Array(totalLen)
    let offset = 0

    if (!this.firstMatchChunk) return result

    // 1. Copy fragment from first chunk
    const firstChunkFragmentStart = this.matchStartPos - this.firstMatchChunkPos
    const firstChunkAvailable = this.firstMatchChunk.length - firstChunkFragmentStart
    const firstChunkTake = Math.min(totalLen, firstChunkAvailable)
    result.set(
      this.firstMatchChunk.subarray(
        firstChunkFragmentStart,
        firstChunkFragmentStart + firstChunkTake
      ),
      0
    )
    offset += firstChunkTake

    // 2. Copy intermediate chunks
    for (let i = 0; i < this.rawBuffer.length; i++) {
      const chunk = this.rawBuffer[i]
      if (chunk === this.currentChunk) continue
      if (chunk === this.firstMatchChunk) continue

      const take = Math.min(chunk.length, totalLen - offset)
      if (take <= 0) break
      result.set(chunk.subarray(0, take), offset)
      offset += take
    }

    // 3. Copy final fragment from current chunk
    if (offset < totalLen && this.currentChunk && this.currentChunk !== this.firstMatchChunk) {
      const take = totalLen - offset
      result.set(this.currentChunk.subarray(0, take), offset)
    }

    return result
  }

  private getLiteralValue(type: TokenType): any {
    if (type === TokenType.TRUE) return true
    if (type === TokenType.FALSE) return false
    return null
  }
}
