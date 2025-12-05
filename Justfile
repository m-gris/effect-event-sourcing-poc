# Event Triggers PoC - Task Runner

backend := "event-triggers-poc-backend"

# Default: list available commands
default:
    @just --list

# Type-check backend
check:
    pnpm --filter {{backend}} check

# Run backend tests
test:
    just check
    pnpm --filter {{backend}} test

# Run backend tests in watch mode
test-watch:
    pnpm --filter {{backend}} test --watch

# Lint backend
lint:
    pnpm --filter {{backend}} lint

# Lint and fix backend
lint-fix:
    pnpm --filter {{backend}} lint-fix

# Build backend
build:
    pnpm --filter {{backend}} build
