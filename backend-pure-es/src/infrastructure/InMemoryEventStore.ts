// =============================================================================
// InMemoryEventStore — Adapter Implementation
// =============================================================================
//
// HEXAGONAL ARCHITECTURE:
// This is an ADAPTER — a concrete implementation of the EventStore port.
// It lives in infrastructure/ because it's about HOW we store, not WHAT we store.
//
// WHY IN-MEMORY FIRST?
// - Fast feedback loop during development
// - No external dependencies (Postgres, Docker, etc.)
// - Tests run instantly
// - Swap to Postgres later via Effect Layers — same interface, different wiring
//
// EFFECT LAYER PATTERN:
// We export both:
//   1. `makeInMemoryEventStore<E>()` — factory that creates a store instance
//   2. `InMemoryUserEventStore` / `InMemoryAddressEventStore` — Layers for DI
//
// The factory is useful for tests (create fresh store per test).
// The Layers are for wiring up the full application.
//
// IMPLEMENTATION:
// Just a Map<StreamId, E[]>. Events are stored in insertion order.
// No persistence — data is lost when the process ends. That's fine for dev/test.
//
import { Effect, Layer } from "effect"
import {
  type EventStoreService,
  type StreamId,
  UserEventStore,
  AddressEventStore
} from "../EventStore.js"
import type { UserEvent } from "../domain/user/Events.js"
import type { AddressEvent } from "../domain/address/Events.js"

// =============================================================================
// Factory: Create an in-memory EventStore instance
// =============================================================================
//
// WHY A FACTORY FUNCTION?
// Each call creates a fresh, isolated store. This is essential for testing —
// each test gets its own store, no shared mutable state between tests.
//
// GENERIC PARAMETER E:
// The event type. Caller specifies what kind of events this store holds.
// Type safety ensures you can't accidentally store UserEvent in an AddressEventStore.
//
// RETURN TYPE:
// Returns the service interface directly (not wrapped in Effect).
// The service methods return Effects, but creating the store is synchronous.
//
export const makeInMemoryEventStore = <E>(): EventStoreService<E> => {
  // The storage: Map from StreamId to array of events
  // Using Map (not plain object) because StreamId is a branded string,
  // and Map handles any key type correctly.
  const streams = new Map<StreamId, E[]>()

  return {
    // -------------------------------------------------------------------------
    // load: StreamId → Effect<E[], never>
    // -------------------------------------------------------------------------
    // Returns all events for a stream, or empty array if stream doesn't exist.
    // Empty array for non-existent stream simplifies aggregate loading:
    //   events.reduce(evolve, initialState) works even with [].
    //
    load: (streamId: StreamId) =>
      Effect.sync(() => {
        const events = streams.get(streamId)
        // Return copy to prevent external mutation of internal state
        // (Defensive programming for correctness, not paranoia)
        return events ? [...events] : []
      }),

    // -------------------------------------------------------------------------
    // append: (StreamId, E[]) → Effect<void, never>
    // -------------------------------------------------------------------------
    // Appends events to a stream. Creates stream if it doesn't exist.
    // Events are added in order; subsequent loads will return them in order.
    //
    append: (streamId: StreamId, events: ReadonlyArray<E>) =>
      Effect.sync(() => {
        if (events.length === 0) {
          // No-op for empty append — don't create empty stream entry
          return
        }
        const existing = streams.get(streamId) ?? []
        streams.set(streamId, [...existing, ...events])
      })
  }
}

// =============================================================================
// Layers: For Effect Dependency Injection
// =============================================================================
//
// EFFECT LAYER PATTERN:
// A Layer describes how to build a service. It's used at the "edge of the world"
// (main, tests) to wire up dependencies.
//
// Layer.succeed: Creates a Layer from a synchronously-built service.
// No dependencies needed — just create the in-memory store.
//
// USAGE:
//   const program = Effect.gen(function* () {
//     const store = yield* UserEventStore
//     const events = yield* store.load(streamId)
//     ...
//   })
//
//   // Wire up with in-memory implementation
//   const runnable = program.pipe(Effect.provide(InMemoryUserEventStore))
//   Effect.runPromise(runnable)
//

// Layer that provides UserEventStore with in-memory implementation
export const InMemoryUserEventStore = Layer.succeed(
  UserEventStore,
  makeInMemoryEventStore<UserEvent>()
)

// Layer that provides AddressEventStore with in-memory implementation
export const InMemoryAddressEventStore = Layer.succeed(
  AddressEventStore,
  makeInMemoryEventStore<AddressEvent>()
)

// Combined layer for convenience — provides both stores
export const InMemoryEventStores = Layer.merge(
  InMemoryUserEventStore,
  InMemoryAddressEventStore
)
