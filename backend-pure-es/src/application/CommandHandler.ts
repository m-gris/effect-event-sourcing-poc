// =============================================================================
// CommandHandler — Application Layer Orchestrator
// =============================================================================
//
// FP/DDD PERSPECTIVE (Wlaschin/De Goes):
// The Application layer orchestrates domain operations without containing
// business logic. It's the "imperative shell" around the "functional core".
//
// This module provides a GENERIC factory that creates command handlers
// for any aggregate, parameterized by:
//   - EventStore Tag (which store to use)
//   - initialState (starting point for fold)
//   - evolve (state rebuilder)
//   - decide (business logic)
//
// WHY GENERIC?
// "Don't repeat yourself" at the type level. User and Address aggregates
// have the same flow (load → fold → decide → append). Only the types differ.
// We abstract the pattern, parameterize the differences.
//
// EFFECT CONTEXT:
// The returned handler requires EventStoreService<E> from context.
// The caller provides this via Layer (InMemory for tests, Postgres for prod).
//
import type { Context } from "effect"
import { Effect, Either } from "effect"
import type { EventStoreService, StreamId } from "../EventStore.js"

// =============================================================================
// makeCommandHandler Factory
// =============================================================================
//
// TYPE PARAMETERS:
//   Tag - The Context.Tag type for the EventStore (e.g., typeof UserEventStore)
//   S   - State type (e.g., Option<User>)
//   E   - Event type (e.g., UserEvent)
//   C   - Command type (e.g., UserCommand)
//   Err - Error type (e.g., UserError)
//
// PARAMETERS:
//   tag         - The EventStore tag to request from context
//   initialState - Starting state for fold (e.g., Option.none())
//   evolve      - (State, Event) → State
//   decide      - (State, Command) → Either<Event[], Error>
//
// RETURNS:
//   (streamId, command) → Effect<Event[], Error, EventStoreService<E>>
//
// SCALA ANALOGY:
// This is like a ZIO service that depends on an EventStore[E].
// The Tag parameter is how Effect knows which service to inject.
//

// TS SYNTAX: Complex generic constraints
//
// `Tag extends Context.Tag<any, EventStoreService<E>>`
//   - Tag must be a Context.Tag
//   - The service it provides must be EventStoreService<E>
//   - This ensures type safety: the tag's event type matches our E
//
// `Context.Tag.Identifier<Tag>`
//   - Extracts the identifier type from the Tag
//   - Used in the return type to declare the dependency correctly
//
export const makeCommandHandler = <
  // The Tag type (e.g., typeof UserEventStore)
  Tag extends Context.Tag<any, EventStoreService<E>>,
  // State, Event, Command, Error types
  S,
  E,
  C,
  Err
>(config: {
  readonly tag: Tag
  readonly initialState: S
  readonly evolve: (state: S, event: E) => S
  readonly decide: (state: S, command: C) => Either.Either<ReadonlyArray<E>, Err>
}) => {
  // Return the handler function
  // The return type declares dependency on the Tag's service
  return (
    streamId: StreamId,
    command: C
  ): Effect.Effect<ReadonlyArray<E>, Err, Context.Tag.Identifier<Tag>> =>
    // =========================================================================
    // EFFECT GENERATOR SYNTAX: Effect.gen(function* () { ... })
    // =========================================================================
    //
    // Effect.gen lets you write async-looking code that's actually Effect-based.
    // Inside the generator, `yield*` "awaits" an Effect and extracts its value.
    //
    // SCALA ANALOGY:
    //   Effect.gen ≈ ZIO's for-comprehension
    //   yield* ≈ <- (flatMap under the hood)
    //
    // Example comparison:
    //   // Scala ZIO
    //   for {
    //     store  <- ZIO.service[EventStore]
    //     events <- store.load(streamId)
    //   } yield events
    //
    //   // Effect TS
    //   Effect.gen(function* () {
    //     const store = yield* EventStore
    //     const events = yield* store.load(streamId)
    //     return events
    //   })
    //
    // WHY `function*` AND NOT `async/await`?
    // - Effect needs to track the error type (E) and requirements (R)
    // - Promises lose type information; generators preserve it
    // - Each `yield*` can fail or require services — all tracked in types
    //
    // TS SYNTAX: `yield*` (yield-star)
    // - `yield*` delegates to another generator/iterable
    // - Effect overloads this for Effect values: "run this Effect, give me result"
    // - If the yielded Effect fails, the whole generator fails
    // - If the yielded Effect needs services, they bubble up to requirements
    //
    Effect.gen(function*() {
      // -----------------------------------------------------------------------
      // STEP 1: Get the EventStore from context
      // -----------------------------------------------------------------------
      // `yield* config.tag` — yield the Tag itself to get the service
      //
      // This is Effect's dependency injection. The Tag is a "capability token".
      // Yielding it says "I need this service from the environment".
      // At runtime, Effect looks up the service in the provided Layer.
      //
      // SCALA ANALOGY: ZIO.service[EventStore]
      //
      const store = yield* config.tag

      // -----------------------------------------------------------------------
      // STEP 2: Load events for this stream
      // -----------------------------------------------------------------------
      // store.load returns Effect<E[], never> — can't fail, always succeeds
      // yield* extracts the E[] value
      //
      const events = yield* store.load(streamId)

      // -----------------------------------------------------------------------
      // STEP 3: Fold events to get current state
      // -----------------------------------------------------------------------
      // Pure JS array reduce — no Effect needed here
      // This is the "fold-on-read" pattern from Event Sourcing
      //
      const currentState = events.reduce(config.evolve, config.initialState)

      // -----------------------------------------------------------------------
      // STEP 4: Decide — apply command to current state
      // -----------------------------------------------------------------------
      // decide is a PURE function (no Effect), returns Either
      // Either<E[], Err> — Right for events, Left for error
      //
      const decision = config.decide(currentState, command)

      // -----------------------------------------------------------------------
      // STEP 5: Handle the decision
      // -----------------------------------------------------------------------
      // Convert Either to Effect:
      //   - Left(error) → Effect.fail(error) — fail the Effect
      //   - Right(events) → continue with events
      //
      // WHY NOT Either.match?
      // We need to short-circuit on error. Effect.fail + yield* does this:
      // if we yield* a failed Effect, the whole generator stops and fails.
      //
      if (Either.isLeft(decision)) {
        return yield* Effect.fail(decision.left)
      }

      const newEvents = decision.right

      // -----------------------------------------------------------------------
      // STEP 6: Append new events to store (if any)
      // -----------------------------------------------------------------------
      // store.append returns Effect<void, never> — fire and forget
      // Only append if there are events (decide may return [] for no-op)
      //
      if (newEvents.length > 0) {
        yield* store.append(streamId, newEvents)
      }

      // -----------------------------------------------------------------------
      // STEP 7: Return the emitted events
      // -----------------------------------------------------------------------
      // The return value becomes the success value of the Effect
      // Caller gets ReadonlyArray<E> on success
      //
      return newEvents
    })
}
