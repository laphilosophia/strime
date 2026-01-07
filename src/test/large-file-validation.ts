import { readFileSync } from 'fs'
import { query } from '../runtime/index'

/**
 * Large File Validation Tests
 *
 * Tests Strime against real-world large datasets:
 * - 1GB 5-level nested (employee data)
 * - 1GB 10-level nested (deep hierarchy)
 */

interface TestCase {
  name: string
  file: string
  query: string
  expectedFields: string[]
  description: string
}

const testCases: TestCase[] = [
  // 5-level nested tests
  {
    name: '5-Level: Simple projection',
    file: 'data/1gb_5lvl_nested_formatted.json',
    query: '{ employee { id, name } }',
    expectedFields: ['employee'],
    description: 'Extract employee ID and name',
  },
  {
    name: '5-Level: Deep nested projection',
    file: 'data/1gb_5lvl_nested_formatted.json',
    query: '{ employee { id, department { name, manager { name, contact { email } } } } }',
    expectedFields: ['employee'],
    description: 'Navigate 4 levels deep',
  },
  {
    name: '5-Level: Array projection',
    file: 'data/1gb_5lvl_nested_formatted.json',
    query: '{ employee { id, projects { projectId, projectName, tasks { taskId, title } } } }',
    expectedFields: ['employee'],
    description: 'Extract nested arrays',
  },

  // 10-level nested tests
  {
    name: '10-Level: Simple projection',
    file: 'data/1gb_10lvl_nested_formatted.json',
    query: '{ employees { id, name } }',
    expectedFields: ['employees'],
    description: 'Extract employee ID and name from deep structure',
  },
  {
    name: '10-Level: Deep path',
    file: 'data/1gb_10lvl_nested_formatted.json',
    query:
      '{ employees { id, profile { contact { address { location { geo { lat, long } } } } } } }',
    expectedFields: ['employees'],
    description: 'Navigate 6+ levels deep',
  },
  {
    name: '10-Level: Complex nested',
    file: 'data/1gb_10lvl_nested_formatted.json',
    query:
      '{ employees { id, profile { projects { projectId, name, tasks { taskId, assignedTo { skills { primary } } } } } } }',
    expectedFields: ['employees'],
    description: 'Mixed arrays and objects',
  },
]

async function runTest(testCase: TestCase): Promise<{
  success: boolean
  duration: number
  throughput: number
  error?: string
}> {
  try {
    console.log(`\n📋 ${testCase.name}`)
    console.log(`   Query: ${testCase.query}`)
    console.log(`   File: ${testCase.file}`)

    const buffer = readFileSync(testCase.file)
    const fileSizeMB = buffer.length / 1024 / 1024

    const start = performance.now()
    const results: any[] = []

    const emitMode = testCase.emitMode || 'object'

    await query(buffer, testCase.query, {
      emitMode,
      sink:
        emitMode === 'flat'
          ? {
              onFlatMatch: (data) => {
                results.push(data)
              },
            }
          : {
              onMatch: (data) => {
                results.push(data)
              },
            },
    })

    const duration = performance.now() - start
    const throughput = (buffer.length * 8) / (duration * 1000) // Mbps

    // Validate results
    if (results.length === 0) {
      throw new Error('No results returned')
    }

    const firstResult = results[0]
    for (const field of testCase.expectedFields) {
      if (!(field in firstResult)) {
        throw new Error(`Expected field '${field}' not found in result`)
      }
    }

    console.log(`   ✅ PASS`)
    console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`)
    console.log(`   Throughput: ${throughput.toFixed(2)} Mbps`)
    console.log(`   Results: ${results.length} items`)

    return {
      success: true,
      duration,
      throughput,
    }
  } catch (error) {
    console.log(`   ❌ FAIL: ${error instanceof Error ? error.message : String(error)}`)
    return {
      success: false,
      duration: 0,
      throughput: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  console.log('='.repeat(70))
  console.log('Strime Large File Validation Tests')
  console.log('='.repeat(70))

  const results = []
  let passed = 0
  let failed = 0

  for (const testCase of testCases) {
    const result = await runTest(testCase)
    results.push({ testCase, result })

    if (result.success) {
      passed++
    } else {
      failed++
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70))
  console.log('Summary')
  console.log('='.repeat(70))
  console.log(`Total: ${testCases.length}`)
  console.log(`Passed: ${passed} ✅`)
  console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`)

  if (passed > 0) {
    const avgThroughput =
      results.filter((r) => r.result.success).reduce((sum, r) => sum + r.result.throughput, 0) /
      passed

    console.log(`\nAverage Throughput: ${avgThroughput.toFixed(2)} Mbps`)
  }

  // Failed tests detail
  if (failed > 0) {
    console.log('\nFailed Tests:')
    results
      .filter((r) => !r.result.success)
      .forEach(({ testCase, result }) => {
        console.log(`  - ${testCase.name}: ${result.error}`)
      })
  }

  console.log('='.repeat(70))

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(console.error)
