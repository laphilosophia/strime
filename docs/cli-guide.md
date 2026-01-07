# Strime CLI Guide

The Strime command-line interface provides access to the projection engine for shell pipelines and data exploration.

## Installation

```bash
npm install -g strime
```

One-time usage without installation:

```bash
npx strime data.json "{ name, email }"
```

## Usage

```
strime [options] [file] <schema>
```

- `file`: JSON file path (omit to read from stdin)
- `schema`: Strime query string (must be quoted)

## Options

| Option | Description |
|--------|-------------|
| `--ndjson`, `--jsonl` | Process as newline-delimited JSON |
| `--skip-errors` | Skip malformed lines (NDJSON only) |
| `--max-line-length <N>` | Maximum line length in bytes (default: 10MB) |
| `--pretty` | Pretty-print output |
| `--compact` | Compact output (default) |
| `--version` | Show version |
| `--help` | Show help |

## Examples

### Query a File

```bash
strime users.json "{ id, name, email }"
```

### Read from stdin

```bash
cat data.json | strime "{ name }"
curl https://api.github.com/users/octocat | strime "{ login, public_repos }"
```

### Nested Fields

```bash
strime order.json "{ orderId, customer { name, address { city } } }"
```

### Process NDJSON

```bash
strime --ndjson logs.log "{ timestamp, level, message }"
```

### Fault-Tolerant NDJSON

```bash
strime --ndjson --skip-errors messy.log "{ id, name }"
```

Malformed lines are skipped with error output to stderr.

### Pretty Output

```bash
strime --pretty data.json "{ name, email }"
```

## Pipeline Examples

```bash
# Extract and save
strime users.json "{ id, email }" > emails.json

# Process and count
curl -s https://api.example.com/items | strime "{ id }" | wc -l

# Monitor live logs
tail -f /var/log/app.log | strime --ndjson "{ timestamp, level }"

# Process compressed files
zcat logs.gz | strime --ndjson "{ message }"

# Chain with grep
grep "ERROR" app.log | strime --ndjson "{ timestamp, message }"
```

## Error Handling

### Malformed JSON

```bash
$ echo '{"broken": json}' | strime "{ broken }"
Error: Unexpected token at position 15
```

### Missing Fields

Missing fields are silently omitted:

```bash
$ echo '{"name": "Alice"}' | strime "{ name, email }"
{"name":"Alice"}
```

### Maximum Line Length

For NDJSON with very long lines:

```bash
strime --ndjson --max-line-length 52428800 huge.log "{ id }"
```

## Comparison with jq

| Aspect | Strime | jq |
|--------|-----|-----|
| Performance | Optimized for throughput | General purpose |
| Memory | O(1) constant | O(N) |
| Syntax | GraphQL-like | Custom DSL |
| Streaming | Native | Limited |
| Transformations | Projection only | Full manipulation |

Use Strime for high-volume extraction. Use jq for complex transformations.

---

For programmatic usage, see [API Reference](api-reference.md). For query syntax, see [Query Language](query-language.md).
