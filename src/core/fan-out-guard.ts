/**
 * Fan-out Guardrails
 *
 * Prevents pathological JSON structures from causing:
 * - Memory exhaustion (deep nesting)
 * - CPU exhaustion (wide arrays)
 * - Allocation bursts (combinatorial explosion)
 */

export interface FanOutLimits {
  maxDepth?: number // Default: 100
  maxArraySize?: number // Default: 100,000
  maxObjectKeys?: number // Default: 10,000
  earlyExit?: boolean // Default: true
}

/**
 * Typed error for fan-out limit violations
 * Enables structured error handling in production
 */
export class FanOutLimitError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly limit: number,
    public readonly actual: number
  ) {
    super(message)
    this.name = 'FanOutLimitError'
  }
}

export class FanOutGuard {
  private limits: Required<FanOutLimits>
  private currentDepth = 0
  private currentArraySize = 0
  private currentObjectKeys = 0

  constructor(limits?: FanOutLimits) {
    this.limits = {
      maxDepth: limits?.maxDepth ?? 100,
      maxArraySize: limits?.maxArraySize ?? 100_000,
      maxObjectKeys: limits?.maxObjectKeys ?? 10_000,
      earlyExit: limits?.earlyExit ?? true,
    }
  }

  enterStructure(isArray: boolean): void {
    this.currentDepth++

    if (this.currentDepth > this.limits.maxDepth) {
      throw new FanOutLimitError(
        `Fan-out limit exceeded: depth ${this.currentDepth} > ${this.limits.maxDepth}`,
        'ERR_Strime_FANOUT_DEPTH',
        this.limits.maxDepth,
        this.currentDepth
      )
    }

    if (isArray) {
      this.currentArraySize = 0
    } else {
      this.currentObjectKeys = 0
    }
  }

  exitStructure(): void {
    this.currentDepth--
  }

  recordArrayElement(): void {
    this.currentArraySize++

    if (this.currentArraySize > this.limits.maxArraySize) {
      if (this.limits.earlyExit) {
        throw new FanOutLimitError(
          `Fan-out limit exceeded: array size ${this.currentArraySize} > ${this.limits.maxArraySize}`,
          'ERR_Strime_FANOUT_ARRAY_SIZE',
          this.limits.maxArraySize,
          this.currentArraySize
        )
      }
    }
  }

  recordObjectKey(): void {
    this.currentObjectKeys++

    if (this.currentObjectKeys > this.limits.maxObjectKeys) {
      if (this.limits.earlyExit) {
        throw new FanOutLimitError(
          `Fan-out limit exceeded: object keys ${this.currentObjectKeys} > ${this.limits.maxObjectKeys}`,
          'ERR_Strime_FANOUT_OBJECT_KEYS',
          this.limits.maxObjectKeys,
          this.currentObjectKeys
        )
      }
    }
  }
}
