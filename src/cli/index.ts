#!/usr/bin/env node
import { createReadStream, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'))
const VERSION = pkg.version

const HELP_TEXT = `
JQL - The fastest streaming JSON projection engine

Usage: jql [options] [file] <schema>

Arguments:
  file              JSON file to process (omit to read from stdin)
  schema            JQL query schema (e.g., "{ id, name }")

Options:
  --ndjson, --jsonl       Process NDJSON (newline-delimited JSON)
  --skip-errors           Skip malformed lines (NDJSON only)
  --max-line-length <N>   Maximum line length in bytes (default: 10MB)
  --pretty                Pretty-print JSON output
  --compact               Compact JSON output (default)
  --version               Show version
  --help                  Show this help

Examples:
  jql data.json "{ id, name }"
  cat data.json | jql "{ user { email } }"
  jql --ndjson logs.log "{ timestamp, message }"
  jql --ndjson --skip-errors messy.log "{ id }"
  jql --ndjson --max-line-length 1048576 huge.log "{ id }"
  echo '{"id":1,"name":"Alice"}' | jql --pretty "{ id, name }"
`

interface CLIArgs {
  schema?: string
  filePath?: string
  isNDJSON: boolean
  pretty: boolean
  skipErrors: boolean
  maxLineLength?: number
  showHelp: boolean
  showVersion: boolean
}

function parseArgs(args: string[]): CLIArgs {
  const result: CLIArgs = {
    isNDJSON: false,
    pretty: false,
    skipErrors: false,
    showHelp: false,
    showVersion: false,
  }

  const params: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--help' || arg === '-h') {
      result.showHelp = true
    } else if (arg === '--version' || arg === '-v') {
      result.showVersion = true
    } else if (arg === '--ndjson' || arg === '--jsonl') {
      result.isNDJSON = true
    } else if (arg === '--skip-errors') {
      result.skipErrors = true
    } else if (arg === '--pretty') {
      result.pretty = true
    } else if (arg === '--compact') {
      result.pretty = false // Explicit compact mode
    } else if (arg === '--max-line-length') {
      const nextArg = args[i + 1]
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --max-line-length requires a numeric argument')
        process.exit(1)
      }
      const value = parseInt(nextArg, 10)
      if (isNaN(value) || value <= 0) {
        console.error('Error: --max-line-length must be a positive integer')
        process.exit(1)
      }
      result.maxLineLength = value
      i++ // Skip next arg
    } else if (arg.startsWith('--')) {
      console.error(`Error: Unknown option '${arg}'`)
      console.error('Run "jql --help" for usage information')
      process.exit(1)
    } else {
      params.push(arg)
    }
  }

  // Parse positional arguments
  if (params.length === 1) {
    result.schema = params[0]
  } else if (params.length === 2) {
    result.filePath = params[0]
    result.schema = params[1]
  } else if (params.length > 2) {
    console.error('Error: Too many arguments')
    console.error('Run "jql --help" for usage information')
    process.exit(1)
  }

  return result
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  // Handle --help
  if (args.showHelp) {
    console.log(HELP_TEXT)
    process.exit(0)
  }

  // Handle --version
  if (args.showVersion) {
    console.log(VERSION)
    process.exit(0)
  }

  // Validate schema
  if (!args.schema) {
    console.error('Error: Missing required argument <schema>')
    console.error('Run "jql --help" for usage information')
    process.exit(1)
  }

  // Validate NDJSON-only flags
  if (args.skipErrors && !args.isNDJSON) {
    console.error('Error: --skip-errors can only be used with --ndjson')
    process.exit(1)
  }

  if (args.maxLineLength !== undefined && !args.isNDJSON) {
    console.error('Error: --max-line-length can only be used with --ndjson')
    process.exit(1)
  }

  try {
    let source: ReadableStream<Uint8Array>

    if (args.filePath) {
      // Read from file
      source = new ReadableStream({
        start(controller) {
          const stream = createReadStream(args.filePath!)
          stream.on('data', (chunk) => {
            controller.enqueue(new Uint8Array(chunk as Buffer))
          })
          stream.on('end', () => {
            controller.close()
          })
          stream.on('error', (err) => {
            controller.error(err)
          })
        },
      })
    } else {
      // Read from stdin
      source = new ReadableStream({
        start(controller) {
          process.stdin.on('data', (chunk) => {
            controller.enqueue(new Uint8Array(chunk as Buffer))
          })
          process.stdin.on('end', () => {
            controller.close()
          })
          process.stdin.on('error', (err) => {
            controller.error(err)
          })
        },
      })
    }

    if (args.isNDJSON) {
      const { ndjsonStream } = await import('../adapters/ndjson')

      // Build options for NDJSON stream
      const options: any = {}

      if (args.skipErrors) {
        options.skipErrors = true
        options.onError = (info: any) => {
          console.error(`[Line ${info.lineNumber}] ${info.error.message}`)
        }
      }

      if (args.maxLineLength !== undefined) {
        options.maxLineLength = args.maxLineLength
      }

      // Process NDJSON stream
      for await (const result of ndjsonStream(source, args.schema, options)) {
        console.log(JSON.stringify(result, null, args.pretty ? 2 : 0))
      }
    } else {
      // Process regular JSON
      const { build } = await import('../runtime/index')
      const { read } = build(source)
      const result = await read(args.schema)
      console.log(JSON.stringify(result, null, args.pretty ? 2 : 0))
    }
  } catch (err: any) {
    // Handle EPIPE gracefully (broken pipe, e.g., piping to `head`)
    if (err.code === 'EPIPE') process.exit(0)

    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
}

main()
