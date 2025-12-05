# Architecture Decisions

## Purpose

This document captures implementation approach decisions for the Event Triggers PoC.

---

## Three-Directory Strategy

The PoC demonstrates **three contrasting approaches** to the same problem, each in its own directory:

```
/
├── docs/                    # Specifications and decisions
├── backend-pure-es/         # Pure Event Sourcing approach
├── backend-hybrid/          # Hybrid approach (TBD)
├── backend-pure-rdbms/      # Pure RDBMS approach (TBD)
└── frontend/                # Shared React frontend (TBD)
```

### Pure Relational DB Approach (`backend-pure-rdbms/`)

- **Storage**: Traditional relational database with CRUD operations
- **Event detection**: Application-layer — the API knows which field is being changed
- **Revert mechanism**: Store old value at change time (e.g., in a `change_history` table); revert = UPDATE with stored value
- **Philosophy**: Event-driven *behavior* without event-sourced *storage*

### Pure Event Sourcing Approach (`backend-pure-es/`)

- **Storage**: Events as the source of truth (append-only event log)
- **State derivation**: Current state rebuilt/projected from event history
- **Revert mechanism**: Old value recovered from event history; revert = new event (e.g., `AddressFieldReverted`)
- **Philosophy**: Full event sourcing — state is a fold over events

### Hybrid Approach (`backend-hybrid/`)

- **Storage**: RDBMS for current state + events table for change history
- **State derivation**: Current state read from relational tables; change events logged separately
- **Revert mechanism**: Events table stores history; revert updates RDBMS and logs revert event
- **Philosophy**: Event sourcing applied surgically for audit/revert needs; incremental adoption

### Rationale

Implementing three approaches allows:
1. Concrete comparison of complexity and trade-offs
2. Demonstration that event-driven behavior doesn't require event sourcing
3. A pragmatic middle-ground (Hybrid) for teams with existing RDBMS infrastructure
4. A learning artifact for the team

---

## Implementation Order

**Sequential, not parallel.**

```
Pure ES  →  Hybrid  →  Pure RDBMS
```

### Why this order?

| Order | Rationale |
|-------|-----------|
| **Pure ES first** | Learn the event sourcing paradigm in its purest form, no RDBMS mental baggage |
| **Hybrid second** | See how to bridge event sourcing with existing relational infrastructure |
| **Pure RDBMS third** | Contrast — understand what pure RDBMS gains (simplicity) and loses (workflow clarity) |

### Why sequential?

- **Learning > speed**: Understanding the patterns matters more than delivering all three fast
- **Cognitive load**: Reviewing and reasoning about three divergent approaches simultaneously risks confusion
- **Conceptual build-up**: Each approach informs the understanding of the next

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| **Database** | PostgreSQL |
| **Backend** | TypeScript (Node.js) |
| **Frontend** | React |
| **Infrastructure** | docker-compose (for DB) |
| **DB Access** | @effect/sql + @effect/sql-pg / Prisma (see per-directory details below) |

### Stack by Directory

| Directory | Backend Framework | DB Access | Rationale |
|-----------|-------------------|-----------|-----------|
| **backend-pure-es/** | **Effect** | **@effect/sql-pg** | Native Effect integration, typed queries, stays in ecosystem |
| **backend-hybrid/** | **Effect** | **Prisma + @effect/sql-pg** | Prisma for RDBMS tables, @effect/sql-pg for events table |
| **backend-pure-rdbms/** | **Effect** | **Prisma** | Classic CRUD — Prisma's sweet spot |

### Why Effect for All Directories?

Effect is **ZIO for TypeScript** — typed errors, dependency injection, resource management, structured concurrency.

| Concept | Effect/FP Equivalent |
|---------|----------------------|
| Events are immutable facts | Immutable data structures |
| State = fold over events | `reduce` / `fold` |
| Side effects (send email) explicit | Effect tracks side effects in types |
| Error handling | Typed errors, not thrown exceptions |

Using Effect across all directories:
- **Consistency**: Same mental model, same patterns — only the storage strategy differs
- **Fair comparison**: Differences between directories are purely about data modeling, not framework noise
- **Learning**: Master one framework deeply rather than three shallowly

### Why @effect/sql-pg?

`@effect/sql-pg` is Effect's first-party PostgreSQL adapter (wraps postgres.js). It provides:
- Native Effect integration — queries return `Effect<A, SqlError, SqlClient>`
- Typed errors, resource management, and observability built-in
- Connection pooling, retry logic, LISTEN/NOTIFY support
- Stays fully within the Effect ecosystem — one mental model, no context-switching

### Implementation Strategy: In-Memory First

Development starts with an **in-memory EventStore**, with PostgreSQL added later as a Layer swap:

1. **Define the `EventStore` service interface first** — `appendEvents`, `readStream`, etc.
2. **Implement `InMemoryEventStore`** — fast feedback, no infrastructure
3. **Wire via Effect Layers** — domain code depends on the interface, not the implementation
4. **Add `PostgresEventStore` later** — swap Layer, domain code unchanged

This approach:
- Forces proper interface/implementation separation from day one
- Validates the Layer pattern before adding database complexity
- Keeps tests fast (no DB required for domain logic)
- Proves the architecture: if it works with in-memory, Postgres is just plumbing

### Notes

- **docker-compose**: PostgreSQL only; app runs locally (not containerized)
- **Shared frontend**: One React app serves all backend directories

---

## Design Philosophy: Functional DDD

This PoC follows **Domain-Driven Design in a functional style**, as advocated by Scott Wlaschin in *Domain Modeling Made Functional*.

### OOP DDD vs Functional DDD

| Aspect | OOP DDD (Evans, Vernon) | Functional DDD (Wlaschin) |
|--------|-------------------------|---------------------------|
| **Where behavior lives** | Inside objects (methods) | Outside data (functions) |
| **Identity & state** | Objects have identity, mutate over time | Values are immutable, new versions created |
| **Aggregates** | Class with private state + methods | Data type + pure functions |
| **Domain logic** | Encapsulated in entity methods | Explicit in workflow functions |
| **Side effects** | Happen inside methods (often hidden) | Pushed to the edges (explicit) |

### Core Principles

1. **Data and behavior are separate** — types describe shape, functions describe transitions

2. **No hidden state changes** — `(State, Command) → (State, Event[])` is explicit

3. **Illegal states unrepresentable** — use the type system to make invalid data unconstructable

4. **Effects at the edges** — pure core, impure shell (database, email, HTTP happen *outside* domain logic)

5. **Composition over inheritance** — no class hierarchies, just functions and data

### Why Effect Fits This Style

Effect is the closest TypeScript gets to F#/Scala expressiveness for functional DDD:

| Wlaschin Concept | Effect Equivalent |
|------------------|-------------------|
| Railway-Oriented Programming (Result) | `Effect<A, E, R>` — success, typed error, dependencies |
| Make illegal states unrepresentable | `@effect/schema` + branded types |
| Pure core, impure shell | Pure functions return `Effect`, runtime executes at edge |
| Workflows as pipelines | `pipe`, `Effect.gen`, `Effect.flatMap` |
| Explicit dependencies | Effect's `Context` / `Layer` |
| Typed errors, not exceptions | `Effect.fail` with discriminated union error types |

### Domain Model Structure

For each aggregate, we define:

1. **Types** — immutable data structures (state, commands, events, value objects)
2. **`decide` function** — `(State, Command) → Either<Error, Event[]>` (what happens)
3. **`evolve` function** — `(State, Event) → State` (how state changes)

Side effects (persist event, send email) happen *after* the pure domain logic, in the Effect runtime.

### Aggregate Boundaries

Two separate aggregates, each with its own event stream:

```
┌─────────────────────────────────┐
│  User Aggregate                 │
│  ─────────────────              │
│  Root: User                     │
│  Events: UserCreated,           │
│          UserNameChanged        │
│  Stream: user-{userId}          │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  Address Aggregate              │
│  ─────────────────              │
│  Root: Address                  │
│  Events: AddressCreated,        │
│          AddressFieldChanged,   │
│          AddressDeleted,        │
│          AddressRestored,       │
│          AddressFieldReverted   │
│  Stream: address-{addressId}    │
│  Reference: userId              │
└─────────────────────────────────┘
```

**Why separate?**

- User and Address change independently (no operation modifies both)
- No cross-entity invariants (e.g., no "must have at least one address" rule)
- No transactional requirement spanning both

**Read-side composition:** The UI displays "user with addresses" by fetching both aggregates and composing them — this is a read concern, not an aggregate design concern.

---

### Invariants

Rules that must always hold, and where they're enforced:

**User Aggregate:**

| Invariant | Enforced By |
|-----------|-------------|
| First name is required (non-empty) | User aggregate |
| Last name is required (non-empty) | User aggregate |

**Address Aggregate:**

| Invariant | Enforced By |
|-----------|-------------|
| All fields required (label, street number, street name, zip, city, country) | Address aggregate |
| Cannot edit a deleted address | Address aggregate |
| Cannot delete an already-deleted address | Address aggregate |

**Cross-Aggregate (enforced at API layer):**

| Invariant | Enforced By | Why Not Aggregate? |
|-----------|-------------|-------------------|
| Address must belong to existing user | API layer | Address can't "see" User aggregate |
| Label must be unique per user | API layer | One Address can't "see" other Addresses |

Cross-aggregate invariants require visibility across aggregates. Following "parse, don't validate" — the API layer verifies these constraints before sending commands to the domain. The domain receives valid, pre-checked input.

---

### Pure Core / Effectful Shell

A standard ES + FP recipe: pure domain logic at the center, effects at the edges.

**Pure (no Effect, no I/O):**

| Component | Signature | Testability |
|-----------|-----------|-------------|
| Domain types | Commands, Events, State, Value Objects | Compiler-checked |
| `decide` | `(State, Command) → Either<Error, Event[]>` | Plain unit tests |
| `evolve` | `(State, Event) → State` | Plain unit tests |

**Effectful (returns `Effect<A, E, R>`):**

| Component | Responsibility | Testability |
|-----------|----------------|-------------|
| Command handler | Load events → fold → decide → persist → trigger side effects | Effect test utilities, mocked services |
| Repository | Read/write events from/to DB | Integration tests |
| Email service | Send notifications via Ethereal | Integration tests |
| API layer | HTTP, parse requests, cross-aggregate validation | E2E tests |

**Effect Layers for Dependency Injection:**

Dependencies are declared in the type signature (the `R` parameter in `Effect<A, E, R>`):

```typescript
const handleCommand: Effect<void, DomainError, EventStore | EmailService>
```

Swap implementations by providing different Layers:

```typescript
// Production: real DB, real email
Effect.runPromise(handleCommand(cmd).pipe(Effect.provide(ProdEnv)))

// Test: in-memory store, mock email
Effect.runPromise(handleCommand(cmd).pipe(Effect.provide(TestEnv)))
```

Benefits:
- **Compile-time safety** — missing dependency = type error, not runtime failure
- **Trivial test isolation** — no mocking frameworks, just provide a test Layer
- **Same code, different wiring** — command handler is unchanged between prod and test

**Visually:**

```
┌─────────────────────────────────────────────────────────────┐
│  PURE CORE                                                  │
│  • Domain types                                             │
│  • decide: (State, Command) → Event[]                       │
│  • evolve: (State, Event) → State                           │
└─────────────────────────────────────────────────────────────┘
                          ↑
                    called by
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  EFFECTFUL SHELL                                            │
│  • Command handler (orchestration)                          │
│  • Repository (DB)                                          │
│  • Email service (notifications)                            │
│  • API routes (HTTP)                                        │
└─────────────────────────────────────────────────────────────┘
```

---

### Testing Strategy

**Hybrid approach:**

1. **Types first** — define domain types (no tests); the compiler validates, types *are* the spec
2. **TDD for domain logic** — `decide` and `evolve` are pure functions, ideal for test-first
3. **Effectful shell tested separately** — command handlers with mocked services, API/DB with integration tests

This balances learning (TypeScript newcomer) with TDD benefits (fast feedback, safety net) where it matters most (pure domain functions).

---

### CQRS: Not Implemented

**CQRS** (Command Query Responsibility Segregation) separates write and read models — writes append events, reads query pre-computed projections. This avoids replaying events on every read, which matters at scale.

**This PoC uses fold-on-read instead:**

```typescript
const state = events.reduce(evolve, initialState)
```

**Why no CQRS for this PoC:**

- **Small scale** — handful of events per aggregate; folding is instant
- **Focus** — the goal is demonstrating event triggers and flows, not read optimization
- **Simplicity** — projections add event handlers, sync logic, more moving parts
- **Explicitness** — fold-on-read makes the ES pattern visible (`state = fold(events)`)

*Note: Fold-on-read is also the "purer" FP approach — state is derived, not cached. CQRS projections are essentially memoization with side effects.*

**Production consideration:** At scale, a separate read model (projection) would be materialized for performance, with different projections optimized for different query needs.

---

### Design Order: Domain First

```
Domain Model  →  Backend API  →  Frontend
```

The API is **derived from** the domain, not designed independently:

- **Domain** defines what exists (types), what can happen (commands), and what has happened (events)
- **API** is merely the HTTP surface that accepts commands and returns results
- **Frontend** is a client of the API

This order ensures:
1. API endpoints map cleanly to domain commands (no impedance mismatch)
2. No primitive obsession leaking into request/response shapes
3. Domain logic remains pure and testable, independent of HTTP concerns
4. Changes flow from domain outward, not from API inward

---

## Orchestration Patterns

### Use Case Layer

The HTTP layer should be thin — just parse request, call use case, format response. Business orchestration lives in a **Use Case** (or "Workflow") layer.

**Why?**

- **Wlaschin**: "Workflows are pipelines. Each step is a function. Compose them."
- **De Goes**: "Effects compose. Services are capabilities. Keep the HTTP layer thin."

**Use Case responsibilities:**

1. Load required state (user, address)
2. Execute command via domain logic
3. React to resulting events (send emails)
4. Return response

The HTTP handler is dumb plumbing; the use case orchestrates.

**Flow (common to all backends):**

```
HTTP Request
    ↓
Parse & validate input
    ↓
Use Case: handleAddressChange(userId, addressId, command)
    ├── Load user (to get email for notifications)
    ├── Execute command (backend-specific: ES fold, RDBMS update, etc.)
    ├── React to changes (send email if user action, skip if correction)
    └── Return result
    ↓
Format HTTP Response
```

### Revert as "Just Another Command"

The revert link in emails triggers a `RevertChange` command — it flows through the same pipeline as any other command.

**Why?**

- Consistency: same orchestration, same validation, same event emission
- Corrections are events too (`*Reverted`, `AddressRestored`, `CreationReverted`)
- The revert token is looked up in state (Pure ES: `pendingReverts` map; Hybrid/RDBMS: lookup table)

**Revert flow:**

```
GET /revert/:token
    ↓
Use Case: handleRevert(token)
    ├── Look up token → find addressId
    ├── Issue RevertChange command
    ├── React to *Reverted event → NO email (corrections are silent)
    └── Return success/failure
    ↓
Redirect to confirmation page
```

### Why Corrections Don't Trigger Emails

User actions (create, update, delete) → email with revert link
Corrections (revert) → silent

**Rationale:**

1. **No spam**: User clicked the revert link — they know what's happening
2. **No infinite loops**: If corrections triggered emails with revert links, you'd get revert-of-revert chains
3. **Clear mental model**: Actions are revertable, corrections are terminal

This is enforced in the Reactions layer via pattern matching:

```typescript
Match.tag("CityChanged", (e) => sendEmail(...))     // user action → email
Match.tag("CityReverted", () => Effect.void)        // correction → silent
```

---

## Resolved Decisions

| Decision | Resolution |
|----------|------------|
| Database | PostgreSQL |
| Backend framework | Effect (all directories) |
| DB access | @effect/sql-pg (Pure ES), Prisma + @effect/sql-pg (Hybrid), Prisma (Pure RDBMS) |
| Frontend | React (shared across all backends) |
| Directory structure | Multi-directory (not multi-branch); shared frontend |

---

## Open Decisions

*(None at this time)*
