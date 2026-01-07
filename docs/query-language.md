# Strime Query Language

Strime uses a structural selection syntax designed for extracting fields from JSON documents. The syntax is intentionally minimal—it describes what to select, not how to transform. This document serves as a reference for the query grammar.

## Selection Syntax

A Strime query describes a projection: which fields to extract from the source document. The basic unit is a field name enclosed in braces.

### Object Selection

Select specific keys from an object:

```strime
{ id, name, email }
```

Given `{"id": 1, "name": "Alice", "email": "a@b.com", "password": "secret"}`, this produces `{"id": 1, "name": "Alice", "email": "a@b.com"}`.

### Nested Selection

Project into nested structures by nesting the selection:

```strime
{
  id,
  user {
    name,
    metadata { role }
  }
}
```

Each level of nesting corresponds to a level of depth in the source document. Fields not mentioned are excluded.

### Array Handling

Strime automatically applies the selection to each element of an array. You do not need special syntax to iterate:

```strime
{ title, tags { name } }
```

If `tags` is an array, this extracts `name` from each element. The output preserves the array structure.

## Aliasing

Rename fields in the output using the `alias: field` syntax:

```strime
{ username: account_login, status: user_status }
```

This selects `account_login` from the source but outputs it as `username`. Aliases apply to the output key only—the source field name is used for matching.

## Directives

Directives modify values during extraction. They are applied after the value is matched but before it is emitted. All directives are O(1) operations with bounded allocation.

### `@default(value: ...)`

Provides a fallback if the field is missing or null:

```strime
{ status @default(value: "unknown") }
```

If `status` is absent or `null`, the output contains `"unknown"`.

### `@substring(start: ..., len: ...)`

Extracts a substring. Capped at 10,000 characters:

```strime
{ bio @substring(start: 0, len: 100) }
```

### `@formatNumber(dec: ...)`

Formats a number to fixed decimal places. Capped at 20 decimals:

```strime
{ price @formatNumber(dec: 2) }
```

### `@coerce(type: ...)`

Coerces the value to a specified type:

```strime
{ count @coerce(type: "number") }
```

Supported types: `"number"`, `"string"`.

## Grammar Summary

```
query       := '{' field_list '}'
field_list  := field (',' field)*
field       := alias? identifier directive* nested?
alias       := identifier ':'
nested      := '{' field_list '}'
directive   := '@' identifier ('(' arg_list ')')?
arg_list    := arg (',' arg)*
arg         := identifier ':' value
value       := string | number | boolean
```

## Error Behavior

- **Missing fields**: Silently omitted unless `@default` is specified.
- **Type mismatch**: Directives return the original value if the type is incompatible (e.g., `@substring` on a number).
- **Malformed query**: Throws a parse error with position information.

---

For execution semantics and streaming behavior, see [Capabilities](capabilities.md). For API usage, see [API Reference](api-reference.md).
