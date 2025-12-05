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

# Start the Pure ES backend server
serve-pure-es:
    pnpm --filter {{backend}} start

# Start the frontend dev server
serve-frontend:
    pnpm --filter frontend dev

# Start both backend and frontend (run in separate terminals)
dev:
    @echo "Run these in separate terminals:"
    @echo "  just serve-pure-es   # Backend on :3000"
    @echo "  just serve-frontend  # Frontend on :5173"
