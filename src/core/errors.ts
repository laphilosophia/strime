/**
 * Base error class for all JQL-related errors.
 * Provides structured error information including error codes and position tracking.
 */
export class JQLError extends Error {
  /**
   * Creates a new JQL error.
   *
   * @param message - Human-readable error message
   * @param code - Machine-readable error code
   * @param position - Byte position in the input where the error occurred
   * @param line - Line number where the error occurred (for NDJSON)
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly position?: number,
    public line?: number
  ) {
    super(message)
    this.name = 'JQLError'

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, JQLError.prototype)
  }

  /**
   * Returns a formatted error message with position information.
   */
  public toString(): string {
    const parts: string[] = [this.name]

    if (this.line !== undefined) {
      parts.push(`[Line ${this.line}]`)
    }

    if (this.position !== undefined) {
      parts.push(`[Position ${this.position}]`)
    }

    parts.push(`[${this.code}]`)
    parts.push(this.message)

    return parts.join(' ')
  }
}

/**
 * Error thrown during tokenization when invalid JSON syntax is encountered.
 */
export class TokenizationError extends JQLError {
  constructor(message: string, position: number) {
    super(message, 'TOKENIZATION_ERROR', position)
    this.name = 'TokenizationError'
    Object.setPrototypeOf(this, TokenizationError.prototype)
  }
}

/**
 * Error thrown during schema parsing when invalid JQL syntax is encountered.
 */
export class ParseError extends JQLError {
  constructor(message: string, position?: number) {
    super(message, 'PARSE_ERROR', position)
    this.name = 'ParseError'
    Object.setPrototypeOf(this, ParseError.prototype)
  }
}

/**
 * Error thrown when the JSON structure doesn't match the expected schema.
 */
export class StructuralMismatchError extends JQLError {
  constructor(message: string, position?: number) {
    super(message, 'STRUCTURAL_MISMATCH', position)
    this.name = 'StructuralMismatchError'
    Object.setPrototypeOf(this, StructuralMismatchError.prototype)
  }
}

/**
 * Signals controlled termination initiated by AbortSignal.
 * Does NOT indicate malformed input or engine failure.
 */
export class AbortError extends JQLError {
  constructor(message = 'Operation aborted', position?: number) {
    super(message, 'ABORTED', position)
    this.name = 'AbortError'
    Object.setPrototypeOf(this, AbortError.prototype)
  }
}

/**
 * Signals deterministic execution halt due to configured limits.
 * Output remains valid up to the last completed emission.
 */
export class BudgetExhaustedError extends JQLError {
  constructor(
    message: string,
    public readonly limitType: 'MATCHES' | 'BYTES' | 'DURATION',
    position?: number
  ) {
    super(message, `BUDGET_EXHAUSTED_${limitType}`, position)
    this.name = 'BudgetExhaustedError'
    Object.setPrototypeOf(this, BudgetExhaustedError.prototype)
  }
}
