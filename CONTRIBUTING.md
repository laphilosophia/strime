# Contributing to Strime

Thank you for your interest in contributing to Strime! This guide will help you get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/laphilosophia/strime.git
cd strime

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build
```

## Code Style

This project uses **ESLint** and **Prettier** for code quality and formatting.

- **ESLint**: Strict TypeScript rules
- **Prettier**: No semicolons, single quotes, 2-space indentation

Pre-commit hooks automatically lint and format staged files.

```bash
# Manual lint
npm run lint
npm run lint:fix

# Manual format
npm run format
npm run format:check
```

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/). All commits must follow this format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style (formatting, semicolons, etc.) |
| `refactor` | Code refactoring |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |

### Examples

```
feat(tokenizer): add support for bigint literals
fix(engine): resolve double-emission on root arrays
docs(readme): update performance benchmarks
perf(skip): implement byte-level structural skip
```

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** from `develop`: `git checkout -b feat/my-feature`
3. **Make changes** and commit using Conventional Commits
4. **Ensure all checks pass**: `npm run lint && npm test && npm run build`
5. **Push** to your fork and create a Pull Request against `develop`

### PR Checklist

- [ ] Tests added/updated for changes
- [ ] Documentation updated if needed
- [ ] Commit messages follow Conventional Commits
- [ ] All CI checks pass

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run dev

# Run benchmarks
npm run bench
```

## Questions?

Open an issue for questions or discussions.
