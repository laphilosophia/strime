# [3.4.0](https://github.com/laphilosophia/strime/compare/v3.3.0...v3.4.0) (2026-01-07)


### Bug Fixes

* trigger npm publish ([cce9e0e](https://github.com/laphilosophia/strime/commit/cce9e0ef69ed15d0aaf35720c4f811234db86b7a))
* update ci node version ([dc6e1c4](https://github.com/laphilosophia/strime/commit/dc6e1c41807da1d52314e79196f9c89e3693de67))
* use scoped npm package @laphilosophia/strime ([ec6fb65](https://github.com/laphilosophia/strime/commit/ec6fb65403e1c2b731b8eca40134ab601d2a367a))


### Features

* rebranding and documentation update ([8b6b7fe](https://github.com/laphilosophia/strime/commit/8b6b7fe708dea73e11325b2e32c1b4c99ded74a8))

# [3.4.0](https://github.com/laphilosophia/strime/compare/v3.3.0...v3.4.0) (2026-01-07)


### Bug Fixes

* trigger npm publish ([cce9e0e](https://github.com/laphilosophia/strime/commit/cce9e0ef69ed15d0aaf35720c4f811234db86b7a))
* update ci node version ([dc6e1c4](https://github.com/laphilosophia/strime/commit/dc6e1c41807da1d52314e79196f9c89e3693de67))


### Features

* rebranding and documentation update ([8b6b7fe](https://github.com/laphilosophia/strime/commit/8b6b7fe708dea73e11325b2e32c1b4c99ded74a8))

# [3.4.0](https://github.com/laphilosophia/strime/compare/v3.3.0...v3.4.0) (2026-01-07)


### Bug Fixes

* update ci node version ([dc6e1c4](https://github.com/laphilosophia/strime/commit/dc6e1c41807da1d52314e79196f9c89e3693de67))


### Features

* rebranding and documentation update ([8b6b7fe](https://github.com/laphilosophia/strime/commit/8b6b7fe708dea73e11325b2e32c1b4c99ded74a8))

# Changelog

## [3.3.0] - 2026-01-08

### Changed - Rebrand: JQL → Strime

Project renamed from JQL to **Strime** to avoid trademark conflict with Jira Query Language.

#### Breaking Changes

- **Package name**: `jql` → `strime`
- **CLI command**: `jql` → `strime`
- **Import path**: `import { query } from 'jql'` → `import { query } from 'strime'`

#### Renamed Exports

| Old Name | New Name |
|----------|----------|
| `JQLParser` | `StrimeParser` |
| `JQLError` | `StrimeError` |
| `JQLStats` | `StrimeStats` |
| `JQLSource` | `StrimeSource` |
| `JQLOptions` | `StrimeOptions` |
| `JQLInstance` | `StrimeInstance` |
| `JQLSubscription` | `StrimeSubscription` |

### Added

- Open-source tooling: ESLint, Prettier, Husky, Commitlint
- GitHub Actions CI workflow
- Community files: CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md
- Issue and PR templates

---

## [3.2.2] - 2026-01-07

### Added - Phase 5.1: Structural Skip Optimization

#### Chunked Execution API

- **`executeChunked(buffer, chunkSize?)`**: New Engine method for processing large single buffers
  - Splits input into fixed-size chunks (default: 64KB, min: 4KB)
  - Enables byte-level skip optimization for monolithic buffers
  - Zero-copy via `subarray()` - no additional allocations

#### Performance Breakthrough

- **6.5x throughput improvement** on skip-heavy workloads:
  - `execute()` (single buffer): 668 Mbps
  - `executeChunked(64KB)`: 4,365 Mbps (+553%)
  - `executeChunked(32KB)`: 4,408 Mbps (+560%)

#### Hybrid Skip Architecture

- **Token-level skip**: Handles initiation chunk remainder (~10% gain)
- **Byte-level skip**: High-speed scanner for subsequent chunks
- **Deferred model**: Deliberate trade-off preserving tokenizer simplicity

### Changed

- Dead code cleanup: Removed unused `closeByte` variable in skip scanner
- Test suite expanded to 57 tests (+4 executeChunked tests)

### Documentation

- Updated `structural_skip_plan.md` with benchmark results
- Added single-buffer limitation WARNING with mitigation
- Session summary updated with final performance metrics

---

## [3.2.1] - 2026-01-07

### Changed - Documentation Rewrite

Complete documentation overhaul following new format guidelines:

- **Format Standardization**: All documentation follows new specification

  - Philosophy-first structure with "why" before "what"
  - Code evidence from actual source files
  - Senior-to-senior academic tone
  - No marketing language or emoji

- **Condensed Guides**:

  - `quick-start.md`: 388 → 100 lines (-74%)
  - `cli-guide.md`: 511 → 130 lines (-75%)

- **Enhanced Documentation**:

  - `internals.md`: Added 4 code evidence blocks
  - `capabilities.md`: Added 5 code evidence blocks
  - `performance.md`: Added benchmark code and methodology
  - `api-reference.md`: Complete API coverage including `ndjsonParallel`, `createCompressionSink`
  - `error-handling.md`: Added error class hierarchy with usage patterns

- **Root README**: Updated with BSL badge, aligned benchmarks, modest value proposition

---

## [3.2.0] - 2026-01-06

### Added - Phase 4: Operational Safety

#### Fan-out Guardrails

- **Depth Limiting**: Configurable `maxDepth` to prevent stack exhaustion (default: 100)
- **Array Size Limiting**: `maxArraySize` for wide array protection (default: 100,000)
- **Object Key Limiting**: `maxObjectKeys` for large object protection (default: 10,000)
- **DoS Protection**: Guards apply to ALL structures, including unmatched/skipped ones
- **Typed Errors**: `FanOutLimitError` with error codes for production monitoring
  - `ERR_Strime_FANOUT_DEPTH` - Depth limit exceeded
  - `ERR_Strime_FANOUT_ARRAY_SIZE` - Array too wide
  - `ERR_Strime_FANOUT_OBJECT_KEYS` - Too many object keys

#### V8 Profiling Infrastructure

- **Profiling Benchmark**: `src/benchmarks/profile-baseline.ts` for performance analysis
- **Data-Driven Optimization**: Identified tokenizer as real bottleneck (43.8% of CPU)

#### Performance Analysis

- **Emit Path Separation**: Function pointer dispatch (code quality, no perf gain)
- **Branch Elimination**: V8's branch predictor already excellent

### Changed

- Engine constructor now accepts `fanOutLimits` option
- Skip path now enforces fan-out guards (critical DoS fix)
- Test suite expanded to 53 tests (+5 fan-out guard tests)

### Performance

- **Average Throughput**: 688 Mbps (no regression)
- **Test Suite**: 53 tests passing
- **DoS Protection**: Full coverage for nested structures

---

## [3.1.0] - 2026-01-05

### Added - Phase 3: P2 Consumer Experience

#### Async Sink Interface

- **Graceful Shutdown**: `onDrain()` callback for clean resource cleanup
- **Backpressure Support**: Async callbacks with Promise-based flow control
- **Composable Architecture**: Modular sink design for extensibility

#### NDJSON Parallel Adapter

- **Worker Pool**: Bounded parallelism with configurable worker count (default: 4)
- **Ordering Modes**: `preserve` (sequential) and `relaxed` (unordered) output
- **Serial Fallback**: Automatic fallback when `parallel: false`
- **Backpressure**: Bounded reorder buffer prevents memory overflow
- **Post-Build Testing**: Integration tests run against compiled code

#### Compression Sink

- **Gzip Support**: Streaming gzip compression (levels 1-9, default: 6)
- **Brotli Support**: Higher compression ratio (levels 0-11, default: 4)
- **Worker Pool**: Non-blocking compression via worker threads
- **Stats Tracking**: Real-time compression ratio and throughput metrics
- **Stream Compatibility**: Both Node.js and Web Streams supported

#### Testing & Validation

- **Large File Tests**: 1GB+ validation with 577K+ records
- **Performance**: 686 Mbps average, 832 Mbps peak throughput
- **Test Coverage**: 48 tests passing, 7 post-build integration tests

### Changed

- Worker pool now uses Node.js `worker_threads` instead of Web Workers
- Runtime layer handles backpressure for all async sinks
- Parallel mode tests skip in development (TypeScript), run post-build

### Performance

- **Average Throughput**: 686 Mbps (1GB files)
- **Peak Throughput**: 832 Mbps (10-level nested)
- **Stability**: Consistent performance across workload types
- **Memory**: O(D) maintained with bounded buffers

### Documentation

- Added compression sink usage examples
- Added parallel adapter configuration guide
- Updated performance benchmarks
- Added large file validation results

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-01-05

### Added

#### Phase 2: P1 Infrastructure & Object Model

- **OutputSink Abstraction**: Decoupled data routing from engine logic

  - `onMatch(data)`: Receives projected results
  - `onRawMatch(bytes)`: Receives raw JSON byte sequences
  - `onStats(stats)`: Receives real-time telemetry
  - Enables future compression and file sink adapters

- **Telemetry System (`onStats`)**:

  - `matchedCount`: Number of successfully projected results
  - `processedBytes`: Total bytes processed
  - `durationMs`: Query execution time
  - `throughputMbps`: Real-time throughput in Mbps
  - `skipRatio`: Efficiency of structural skipping (0-1)
  - Zero overhead when not used (properly guarded)

- **Raw Emission Mode (`emitRaw`)**:

  - Zero-copy byte-perfect reconstruction of matched JSON
  - Cross-chunk assembly for structures spanning multiple stream chunks
  - Ideal for piping original JSON to other streams without re-stringification

- **Enhanced Skip Logic**:
  - Fixed structural stack corruption when exiting skip-state
  - Proper `onStructureEnd` calls for skipped structures
  - Maintains correctness at 99.97% skip ratios

### Fixed

- **Root Array Double-Emission**: Fixed critical bug where root arrays were emitted as matches in addition to their elements

  - Added `wasArray` state tracking before stack operations
  - Proper distinction between root objects (emit) and root arrays (store only)

- **Partial JSON Recovery**: `getResult()` now returns partial results for malformed JSON instead of `undefined`

  - Falls back to `resultStack[0]` when `finalResult` is undefined

- **Stats Calculation Overhead**: Fixed unconditional `getStats()` evaluation
  - Now properly guarded with `if (sink?.onStats)` check
  - Eliminated 2x `performance.now()` calls per query when telemetry not used

### Performance

- **No Regression Detected**: ✅

  - Baseline: 122MB in 4.38s (222.8 Mbps)
  - Current: 1GB in 10.40s (808.5 Mbps)
  - **3.6x better than linear scaling**

- **Stress Test Results** (1GB dataset):
  - Simple projection: 875.84 Mbps
  - Nested projection: 869.22 Mbps
  - Multi-field: 880.62 Mbps
  - Query complexity has minimal impact (~1% variance)

### Testing

- **35 Tests**: All passing (100% success rate)
- **Phase 2 Verification Suite**:
  - Telemetry accuracy verified
  - Raw emission byte-perfect reconstruction verified
  - Cross-chunk assembly verified
  - Root array handling verified

### Breaking Changes

**None** - Fully backward compatible with v2.x

### Migration Guide

#### Using Telemetry

```typescript
import { query } from 'strime'

const result = await query(data, '{ id, name }', {
  sink: {
    onStats: (stats) => {
      console.log(`Processed ${stats.processedBytes} bytes`)
      console.log(`Throughput: ${stats.throughputMbps.toFixed(2)} Mbps`)
      console.log(`Skip ratio: ${(stats.skipRatio * 100).toFixed(1)}%`)
    },
  },
})
```

#### Using Raw Emission

```typescript
import { query } from 'strime'

const rawChunks: Uint8Array[] = []

await query(stream, '{ items { id } }', {
  emitMode: 'raw',
  sink: {
    onRawMatch: (bytes) => {
      rawChunks.push(bytes)
      // Pipe original JSON bytes directly to another stream
    },
  },
})
```

#### Using OutputSink for Streaming

```typescript
import { subscribe } from 'strime'

subscribe(stream, '{ name }', {
  onMatch: (match) => {
    console.log('Match found:', match)
  },
  onComplete: () => {
    console.log('Stream processing complete')
  },
})
```

---

## [2.2.1] - 2026-01-05

### Added

#### Dual Tokenizer API

- **Iterator Pattern**: New `tokenize()` generator method for convenient token iteration
- **Callback Pattern**: Existing `processChunk()` optimized for zero-allocation streaming
- Each API serves different use cases: convenience vs. performance

#### Production-Grade Error Handling

- **Proper Error Types**:
  - `StrimeError`: Base error class with error codes and position tracking
  - `TokenizationError`: For invalid JSON syntax during tokenization
  - `ParseError`: For invalid Strime schema syntax
  - `StructuralMismatchError`: For JSON structure vs. schema mismatches
- **Position Tracking**: All errors include byte position where they occurred
- **Line Number Tracking**: NDJSON errors include line numbers

#### NDJSON Fault Tolerance

- **`skipErrors` Option**: Continue processing when encountering corrupt lines
- **`onError` Callback**: Detailed error information including:
  - Error object with code and message
  - Line number where error occurred
  - Line content that caused the error
- **`maxLineLength` Option**: DoS protection (default: 10MB)
  - Prevents memory exhaustion from extremely long lines
  - Configurable per use case

#### Comprehensive Documentation

- JSDoc comments for all public APIs
- Usage examples in README
- Migration guide for new features
- Error handling best practices

### Fixed

- **Build Errors**: Fixed TypeScript compilation issues in indexed mode
- **Test Failures**: Fixed tokenizer tests to use correct callback pattern
- **Type Safety**: Replaced `any` with `unknown` for better type safety
- **buildRootIndex**: Now uses proper iterator pattern instead of broken callback

### Changed

- **Token Interface**: `value` property changed from `any` to `unknown` for type safety
- **Error Messages**: More descriptive with position information
- **NDJSON Adapter**: Complete rewrite with fault tolerance and DoS protection

### Performance

- **No Regression**: All benchmarks still passing
  - 1M rows: ~4.3s (target: <4.5s) ✅
  - Memory: O(D) constant overhead ✅
  - Extreme nesting (1000 levels): <2ms ✅
- **Memory Improvement**: 37MB vs. previous 77MB for 1M rows (~52% improvement)

### Testing

- **35 Tests**: All passing (100% success rate)
- **9 New Tests**: Comprehensive NDJSON error handling coverage
- **Edge Cases**: Empty lines, chunked data, multiple errors, DoS protection

### Breaking Changes

**None** - Fully backward compatible

---

## [2.2.0] - 2025-12-XX

### Added

- Initial release with streaming JSON projection
- NDJSON adapter
- Directive system
- CLI tool

---

**Full Changelog**: <https://github.com/laphilosophia/strime/compare/v2.2.1...v3.0.0>
