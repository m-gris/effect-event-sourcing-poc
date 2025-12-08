# Event Triggers PoC - Task Runner

backend := "event-triggers-poc-backend"

# Default: list available commands
default:
    @just --list

# Type-check backend
check-backend:
    pnpm --filter {{backend}} check

# Type-check frontend
check-frontend:
    pnpm --filter frontend check

# Type-check all
check:
    just check-backend
    just check-frontend

# Run all tests (backend + frontend)
test:
    just check
    pnpm --filter {{backend}} test
    pnpm --filter frontend test:run

# Run backend tests only
test-backend:
    just check-backend
    pnpm --filter {{backend}} test

# Run frontend tests only
test-frontend:
    just check-frontend
    pnpm --filter frontend test:run

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

# Run Cypress E2E tests headless (CI mode)
test-e2e-headless:
    pnpm --filter frontend e2e

# Run Cypress E2E tests interactively (opens browser UI)
test-e2e-ui:
    pnpm --filter frontend cy:open
