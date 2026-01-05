import { Engine } from '../core/engine';
import { JQLError } from '../core/errors';
import { JQLParser } from '../core/parser';

/**
 * Information about an error that occurred while processing an NDJSON line.
 */
export interface NDJSONErrorInfo {
  /** The error that occurred */
  readonly error: JQLError;
  /** Line number where the error occurred (1-indexed) */
  readonly lineNumber: number;
  /** Content of the line that caused the error (decoded as string) */
  readonly lineContent: string;
}

/**
 * Options for NDJSON stream processing.
 */
export interface NDJSONOptions {
  /** Enable debug logging */
  readonly debug?: boolean;

  /**
   * If true, skip lines that cause errors and continue processing.
   * If false (default), throw on first error.
   */
  readonly skipErrors?: boolean;

  /**
   * Callback invoked when an error occurs (only when skipErrors is true).
   * Provides detailed error information including line number and content.
   */
  readonly onError?: (errorInfo: NDJSONErrorInfo) => void;

  /**
   * Maximum allowed line length in bytes.
   * Prevents DoS attacks from extremely long lines.
   * Default: 10MB
   */
  readonly maxLineLength?: number;
}

/** Default maximum line length: 10MB */
const DEFAULT_MAX_LINE_LENGTH = 10 * 1024 * 1024;

/**
 * NDJSON Adapter with fault tolerance.
 *
 * Processes a stream of newline-delimited JSON objects with comprehensive
 * error handling and DoS protection.
 *
 * @param stream - ReadableStream of Uint8Array chunks
 * @param schema - JQL schema string
 * @param options - Processing options
 * @yields Parsed and projected objects
 *
 * @example
 * ```typescript
 * // Fault-tolerant processing
 * for await (const result of ndjsonStream(stream, '{ id, name }', {
 *   skipErrors: true,
 *   onError: (info) => console.error(`Line ${info.lineNumber}: ${info.error.message}`),
 *   maxLineLength: 1024 * 1024 // 1MB limit
 * })) {
 *   console.log(result);
 * }
 * ```
 */
export async function* ndjsonStream(
  stream: ReadableStream<Uint8Array>,
  schema: string,
  options: NDJSONOptions = {}
): AsyncGenerator<unknown, void, undefined> {
  const parser = new JQLParser(schema);
  const map = parser.parse();
  const engine = new Engine(map, { debug: options.debug });
  const maxLineLength = options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;

  const reader = stream.getReader();
  let leftover: Uint8Array | null = null;
  let lineNumber = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      let chunk = value;
      if (leftover !== null) {
        const combined = new Uint8Array(leftover.length + value.length);
        combined.set(leftover);
        combined.set(value, leftover.length);
        chunk = combined;
        leftover = null;
      }

      let start = 0;
      while (start < chunk.length) {
        const newlineIndex = chunk.indexOf(10, start); // 10 is \n

        if (newlineIndex === -1) {
          // No newline found - save for next chunk
          const remaining = chunk.slice(start);

          // DoS protection: check for extremely long lines
          if (remaining.length > maxLineLength) {
            const error = new JQLError(
              `Line exceeds maximum length of ${maxLineLength} bytes`,
              'LINE_TOO_LONG',
              undefined,
              lineNumber + 1
            );

            if (options.skipErrors === true) {
              options.onError?.({
                error,
                lineNumber: lineNumber + 1,
                lineContent: `[Line too long: ${remaining.length} bytes]`
              });
              // Skip this line and continue
              leftover = null;
              break;
            } else {
              throw error;
            }
          }

          leftover = remaining;
          break;
        }

        const line = chunk.subarray(start, newlineIndex);
        lineNumber++;

        if (line.length > 0) {
          // Check line length before processing
          if (line.length > maxLineLength) {
            const error = new JQLError(
              `Line ${lineNumber} exceeds maximum length of ${maxLineLength} bytes`,
              'LINE_TOO_LONG',
              undefined,
              lineNumber
            );

            if (options.skipErrors === true) {
              options.onError?.({
                error,
                lineNumber,
                lineContent: `[Line too long: ${line.length} bytes]`
              });
              // Skip this line and continue
              start = newlineIndex + 1;
              continue;
            } else {
              throw error;
            }
          }

          try {
            engine.reset();
            const result = engine.execute(line);
            yield result;
          } catch (error) {
            // Convert to JQLError if needed
            const jqlError = error instanceof JQLError
              ? error
              : new JQLError(
                error instanceof Error ? error.message : String(error),
                'UNKNOWN_ERROR'
              );

            // Add line number context
            jqlError.line = lineNumber;

            if (options.skipErrors === true) {
              // Decode line content for error reporting
              const decoder = new TextDecoder('utf-8', { fatal: false });
              const lineContent = decoder.decode(line);

              options.onError?.({
                error: jqlError,
                lineNumber,
                lineContent
              });
              // Continue to next line
            } else {
              throw jqlError;
            }
          }
        }

        start = newlineIndex + 1;
      }
    }

    // Process final line if exists
    if (leftover !== null && leftover.length > 0) {
      lineNumber++;

      if (leftover.length > maxLineLength) {
        const error = new JQLError(
          `Final line exceeds maximum length of ${maxLineLength} bytes`,
          'LINE_TOO_LONG',
          undefined,
          lineNumber
        );

        if (options.skipErrors === true) {
          options.onError?.({
            error,
            lineNumber,
            lineContent: `[Line too long: ${leftover.length} bytes]`
          });
        } else {
          throw error;
        }
      } else {
        try {
          engine.reset();
          const result = engine.execute(leftover);
          yield result;
        } catch (error) {
          const jqlError = error instanceof JQLError
            ? error
            : new JQLError(
              error instanceof Error ? error.message : String(error),
              'UNKNOWN_ERROR'
            );

          jqlError.line = lineNumber;

          if (options.skipErrors === true) {
            const decoder = new TextDecoder('utf-8', { fatal: false });
            const lineContent = decoder.decode(leftover);

            options.onError?.({
              error: jqlError,
              lineNumber,
              lineContent
            });
          } else {
            throw jqlError;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
