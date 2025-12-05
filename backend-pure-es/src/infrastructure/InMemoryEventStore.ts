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
import type { AddressEvent } from "../domain/address/Events.js"
import type { UserEvent } from "../domain/user/Events.js"
import { AddressEventStore, type EventStoreService, type StreamId, UserEventStore } from "../EventStore.js"

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
  const streams = new Map<StreamId, Array<E>>()

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
// WHAT IS A LAYER?
// A Layer describes HOW to build a service from its dependencies.
// It's the "wiring" that connects interfaces (Tags) to implementations.
//
// SCALA ANALOGY:
//   Layer ≈ ZLayer in ZIO
//   Layer<ROut, E, RIn> ≈ ZLayer[RIn, E, ROut]
//     - ROut: what this layer PROVIDES (the service)
//     - E: errors that can occur during construction
//     - RIn: what this layer REQUIRES (dependencies)
//
// LAYER CONSTRUCTION VARIANTS:
//
//   Layer.succeed(Tag, service)
//     - Creates layer from an ALREADY-BUILT service instance
//     - The service is evaluated ONCE at layer definition time
//     - ⚠️ PROBLEM: Shared mutable state across all uses!
//
//   Layer.sync(Tag, () => service)
//     - Creates layer from a FACTORY function
//     - The factory is called EACH TIME the layer is used
//     - ✅ Each use gets a FRESH instance — perfect for tests!
//
//   Layer.effect(Tag, Effect)
//     - Creates layer from an effectful computation
//     - For when construction needs async/IO (e.g., DB connection)
//
// WHY Layer.sync AND NOT Layer.succeed?
// We initially used Layer.succeed, but tests were SHARING state!
// Test 1 appends events, Test 2 sees them — not isolated.
// Layer.sync ensures each test (each Effect.provide) gets its own store.
//
// USAGE (Effect.provide):
//
//   // Define a program that REQUIRES UserEventStore
//   const program = Effect.gen(function* () {
//     const store = yield* UserEventStore  // "I need this service"
//     const events = yield* store.load(streamId)
//     return events
//   })
//   // program has type: Effect<Event[], never, UserEventStore>
//   //                                         ^^^^^^^^^^^^^^ requirement!
//
//   // PROVIDE the implementation via Layer
//   const runnable = program.pipe(
//     Effect.provide(InMemoryUserEventStore)
//   )
//   // runnable has type: Effect<Event[], never, never>
//   //                                          ^^^^^ no more requirements!
//
//   // Now we can run it
//   Effect.runPromise(runnable)
//
// SCALA ANALOGY:
//   program.provide(InMemoryUserEventStore) ≈
//   program.provideLayer(InMemoryUserEventStore)
//
// THE "EDGE OF THE WORLD":
// Layers are composed and provided at the entry point (main, test setup).
// The core code just declares requirements; it doesn't know the implementation.
// This is Dependency Injection done right — compile-time checked, no reflection.
//

// -----------------------------------------------------------------------------
// Layer.sync: Fresh instance per use
// -----------------------------------------------------------------------------
// Each time this layer is provided to an Effect, the factory runs anew.
// Critical for test isolation — each test gets its own empty store.
//
export const InMemoryUserEventStore = Layer.sync(
  UserEventStore,
  () => makeInMemoryEventStore<UserEvent>()
)

export const InMemoryAddressEventStore = Layer.sync(
  AddressEventStore,
  () => makeInMemoryEventStore<AddressEvent>()
)

// -----------------------------------------------------------------------------
// Layer.merge: Combine multiple layers
// -----------------------------------------------------------------------------
// Creates a layer that provides BOTH services.
// Useful when a program needs multiple services.
//
// SCALA ANALOGY: ZLayer.make / ++ operator
//
export const InMemoryEventStores = Layer.merge(
  InMemoryUserEventStore,
  InMemoryAddressEventStore
)
