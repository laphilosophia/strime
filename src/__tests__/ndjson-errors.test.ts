import { describe, expect, it } from 'vitest';
import { NDJSONErrorInfo, ndjsonStream } from '../adapters/ndjson';
import { JQLError } from '../core/errors';

describe('NDJSON Error Handling', () => {
  it('should skip corrupt lines when skipErrors is true', async () => {
    const lines = [
      '{"id": 1, "valid": true}',
      '{"id": 2, "broken": truX}', // Invalid literal
      '{"id": 3, "valid": true}'
    ];

    const stream = new ReadableStream({
      start(controller) {
        const chunk = new TextEncoder().encode(lines.join('\n'));
        controller.enqueue(chunk);
        controller.close();
      }
    });

    const results: unknown[] = [];
    const errors: NDJSONErrorInfo[] = [];

    for await (const result of ndjsonStream(stream, '{ id, valid }', {
      skipErrors: true,
      onError: (errorInfo) => errors.push(errorInfo)
    })) {
      results.push(result);
    }

    expect(results).toHaveLength(2);
    expect((results[0] as { id: number }).id).toBe(1);
    expect((results[1] as { id: number }).id).toBe(3);
    expect(errors).toHaveLength(1);
    expect(errors[0].lineNumber).toBe(2);
    expect(errors[0].error).toBeInstanceOf(JQLError);
    expect(errors[0].lineContent).toContain('truX');
  });

  it('should throw on corrupt line when skipErrors is false', async () => {
    const lines = [
      '{"id": 1}',
      '{"id": truX}', // Invalid
    ];

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(lines.join('\n')));
        controller.close();
      }
    });

    const results: unknown[] = [];

    await expect(async () => {
      for await (const result of ndjsonStream(stream, '{ id }')) {
        results.push(result);
      }
    }).rejects.toThrow(JQLError);

    expect(results).toHaveLength(1); // Only first line processed
  });

  it('should reject lines exceeding maxLineLength', async () => {
    const hugeLine = '{"data": "' + 'x'.repeat(1000000) + '"}';

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(hugeLine));
        controller.close();
      }
    });

    await expect(async () => {
      for await (const _ of ndjsonStream(stream, '{ data }', {
        maxLineLength: 1000
      })) {
        // Should not reach here
      }
    }).rejects.toThrow('exceeds maximum length');
  });

  it('should skip lines exceeding maxLineLength when skipErrors is true', async () => {
    const lines = [
      '{"id": 1}',
      '{"id": 2, "data": "' + 'x'.repeat(10000) + '"}', // Too long
      '{"id": 3}'
    ];

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(lines.join('\n')));
        controller.close();
      }
    });

    const results: unknown[] = [];
    const errors: NDJSONErrorInfo[] = [];

    for await (const result of ndjsonStream(stream, '{ id }', {
      skipErrors: true,
      maxLineLength: 1000,
      onError: (info) => errors.push(info)
    })) {
      results.push(result);
    }

    expect(results).toHaveLength(2);
    expect((results[0] as { id: number }).id).toBe(1);
    expect((results[1] as { id: number }).id).toBe(3);
    expect(errors).toHaveLength(1);
    expect(errors[0].lineNumber).toBe(2);
    expect(errors[0].error.code).toBe('LINE_TOO_LONG');
  });

  it('should provide detailed error information', async () => {
    const lines = ['{"id": 1}', '{"id": truX}'];

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(lines.join('\n')));
        controller.close();
      }
    });

    const errors: NDJSONErrorInfo[] = [];

    for await (const _ of ndjsonStream(stream, '{ id }', {
      skipErrors: true,
      onError: (info) => errors.push(info)
    })) {
      // Process valid lines
    }

    expect(errors).toHaveLength(1);
    expect(errors[0].lineNumber).toBe(2);
    expect(errors[0].lineContent).toBe('{"id": truX}');
    expect(errors[0].error.code).toBeDefined();
    expect(errors[0].error.line).toBe(2);
  });

  it('should handle empty lines gracefully', async () => {
    const lines = [
      '{"id": 1}',
      '', // Empty line
      '{"id": 2}'
    ];

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(lines.join('\n')));
        controller.close();
      }
    });

    const results: unknown[] = [];

    for await (const result of ndjsonStream(stream, '{ id }')) {
      results.push(result);
    }

    expect(results).toHaveLength(2);
    expect((results[0] as { id: number }).id).toBe(1);
    expect((results[1] as { id: number }).id).toBe(2);
  });

  it('should handle multiple errors in sequence', async () => {
    const lines = [
      '{"id": 1}',
      '{"val": truX}', // Invalid - different key to avoid confusion
      '{"id": 2}',
      '{"val": falX}', // Invalid
      '{"id": 3}'
    ];

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(lines.join('\n')));
        controller.close();
      }
    });

    const results: unknown[] = [];
    const errors: NDJSONErrorInfo[] = [];

    for await (const result of ndjsonStream(stream, '{ id }', {
      skipErrors: true,
      onError: (info) => errors.push(info)
    })) {
      results.push(result);
    }

    // Lines 2 and 4 have errors, but they don't have "id" field
    // So we should get 3 results (lines 1, 3, 5)
    expect(results).toHaveLength(3);
    expect((results[0] as { id: number }).id).toBe(1);
    expect((results[1] as { id: number }).id).toBe(2);
    expect((results[2] as { id: number }).id).toBe(3);
    expect(errors).toHaveLength(2);
    expect(errors[0].lineNumber).toBe(2);
    expect(errors[1].lineNumber).toBe(4);
  });

  it('should handle final line without newline', async () => {
    const content = '{"id": 1}\n{"id": 2}'; // No trailing newline

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(content));
        controller.close();
      }
    });

    const results: unknown[] = [];

    for await (const result of ndjsonStream(stream, '{ id }')) {
      results.push(result);
    }

    expect(results).toHaveLength(2);
    expect((results[1] as { id: number }).id).toBe(2);
  });

  it('should handle chunked data across line boundaries', async () => {
    const line1 = '{"id": 1, "name": "test1"}';
    const line2 = '{"id": 2, "name": "test2"}';

    const stream = new ReadableStream({
      start(controller) {
        // Split in the middle of line 2
        const full = line1 + '\n' + line2;
        const splitPoint = line1.length + 5;

        controller.enqueue(new TextEncoder().encode(full.substring(0, splitPoint)));
        controller.enqueue(new TextEncoder().encode(full.substring(splitPoint)));
        controller.close();
      }
    });

    const results: unknown[] = [];

    for await (const result of ndjsonStream(stream, '{ id, name }')) {
      results.push(result);
    }

    expect(results).toHaveLength(2);
    expect((results[0] as { id: number; name: string }).name).toBe('test1');
    expect((results[1] as { id: number; name: string }).name).toBe('test2');
  });
});
