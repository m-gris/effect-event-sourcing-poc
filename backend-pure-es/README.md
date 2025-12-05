# Backend: Pure Event Sourcing

This is the **Pure ES** implementation of the event-triggers PoC. Events are the single source of truth — state is derived by folding events with `evolve`.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           LAYERS                                     │
├─────────────────────────────────────────────────────────────────────┤
│  DOMAIN (pure)                                                       │
│    ├── user/     State, Events, Commands, decide, evolve             │
│    │             User: id, email, firstName, lastName                │
│    └── address/  State, Events, Commands, decide, evolve             │
│                  pendingReverts map for one-time revert tokens       │
├─────────────────────────────────────────────────────────────────────┤
│  SHARED                                                              │
│    └── Email.ts  Branded, validated — used by domain + infra         │
├─────────────────────────────────────────────────────────────────────┤
│  APPLICATION                                                         │
│    └── CommandHandler.ts  Generic load → fold → decide → append      │
├─────────────────────────────────────────────────────────────────────┤
│  REACTIONS                                                           │
│    └── AddressReactions.ts  Event → email (Match.exhaustive)         │
├─────────────────────────────────────────────────────────────────────┤
│  PORTS (interfaces)                                                  │
│    ├── EventStore.ts   Generic EventStoreService<E>, per-aggregate   │
│    └── EmailService.ts send(email) → Effect<void, EmailError>        │
├─────────────────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE (adapters)                                           │
│    ├── InMemoryEventStore.ts   Map-based, for dev/test               │
│    └── ConsoleEmailService.ts  Logs + CaptureEmailService for tests  │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Patterns

### Functional DDD (Wlaschin style)

- **State** is data (immutable records)
- **Behavior** lives in functions, not methods
- `decide(state, command) → Either<Event[], Error>` — business logic
- `evolve(state, event) → State` — state rebuilder (fold accumulator)

### Event Sourcing

- Events are the source of truth
- State is derived: `events.reduce(evolve, initialState)`
- No CQRS — fold-on-read for simplicity

### Effect-TS

- `Effect<A, E, R>` — typed errors (E) and requirements (R)
- `Context.Tag` — dependency injection via Layers
- `Match.exhaustive` — compile-time guarantee all cases handled
- `Schema` — runtime validation + branded types

## Key Design Decisions

### Two Aggregates: User and Address

- **User**: id, email, firstName, lastName
- **Address**: id, userId, label, streetNumber, streetName, zipCode, city, country
- Separate aggregates = separate consistency boundaries

### Revert Tokens

- User actions (create, update, delete) get a `revertToken`
- Token stored in `pendingReverts` map within AddressState
- `RevertChange` command looks up token → emits `*Reverted` event
- One-time use: token removed after revert
- Corrections (`*Reverted` events) don't trigger new emails — no infinite loops

### Event → Email Routing

```typescript
const reactToAddressEvent = (event, userEmail) =>
  Match.value(event).pipe(
    Match.tag("AddressCreated", (e) => sendEmail(...)),
    Match.tag("CityChanged", (e) => sendEmail(...)),
    // ... all user actions → email
    Match.tag("CityReverted", () => Effect.void), // corrections → silent
    // ...
    Match.exhaustive
  )
```

**The core insight**: Events ARE the triggers. The event `_tag` is the routing key. No TriggerConfig table, no scheduler, no polling.

## File Structure

```
src/
├── domain/
│   ├── user/
│   │   ├── State.ts      # User type + value objects
│   │   ├── Events.ts     # UserCreated, FirstNameChanged, LastNameChanged
│   │   ├── Commands.ts   # CreateUser, ChangeFirstName, ChangeLastName
│   │   ├── decide.ts     # (State, Command) → Either<Event[], Error>
│   │   └── evolve.ts     # (State, Event) → State
│   └── address/
│       ├── State.ts      # Address + AddressState (with pendingReverts)
│       ├── Events.ts     # AddressCreated, *Changed, *Reverted, etc.
│       ├── Commands.ts   # CreateAddress, Change*, DeleteAddress, RevertChange
│       ├── decide.ts
│       └── evolve.ts
├── shared/
│   └── Email.ts          # Branded Email type (used by domain + infra)
├── application/
│   └── CommandHandler.ts # Generic command handler factory
├── reactions/
│   └── AddressReactions.ts # Event → email pattern matching
├── infrastructure/
│   ├── InMemoryEventStore.ts
│   └── ConsoleEmailService.ts
├── EventStore.ts         # Port: EventStoreService<E> + Tags
└── EmailService.ts       # Port: EmailServiceInterface + Tag

test/
├── domain/
│   ├── user/
│   │   ├── decide.test.ts
│   │   └── evolve.test.ts
│   └── address/
│       ├── decide.test.ts
│       └── evolve.test.ts
├── application/
│   └── CommandHandler.test.ts
├── reactions/
│   └── AddressReactions.test.ts
└── infrastructure/
    ├── InMemoryEventStore.test.ts
    └── ConsoleEmailService.test.ts
```

## Running

From the project root (`event-triggers-poc/`):

```bash
# List available commands
just

# Type-check
just check

# Run tests (includes type-check)
just test

# Run tests in watch mode
just test-watch

# Lint
just lint

# Build
just build
```

## What's Left

- [ ] HTTP layer (endpoints for commands)
- [ ] Wiring (main.ts composing all layers)
- [ ] Ethereal email adapter (real SMTP for demo)
- [ ] Frontend (simple React form)
