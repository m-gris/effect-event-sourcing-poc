// =============================================================================
// TDD: makeCommandHandler
// =============================================================================
//
// The CommandHandler is the APPLICATION LAYER orchestrator.
// It wires together: EventStore (load/append) + evolve (fold) + decide (logic)
//
// This is NOT domain logic — it's the "glue" that:
//   1. Loads events from store
//   2. Folds them with evolve to get current state
//   3. Calls decide with state + command
//   4. Appends resulting events to store
//   5. Returns the events (for downstream reactions)
//
// EFFECT CONTEXT:
// The handler requires an EventStore<E> from context.
// Tests provide InMemoryEventStore via Layer.
//
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Option } from "effect"
import type { ChangeFirstName, CreateUser } from "../../src/domain/user/Commands.js"
import type { UserEvent } from "../../src/domain/user/Events.js"
import type { User } from "../../src/domain/user/State.js"
import { StreamId, UserEventStore } from "../../src/EventStore.js"
import { InMemoryUserEventStore } from "../../src/infrastructure/InMemoryEventStore.js"

// Will fail until we create makeCommandHandler — that's TDD!
import { makeCommandHandler } from "../../src/application/CommandHandler.js"
import { decide } from "../../src/domain/user/decide.js"
import { evolve } from "../../src/domain/user/evolve.js"

// =============================================================================
// Test Fixtures
// =============================================================================

const userId = "user-123" as User["id"]
const firstName = "Jean" as User["firstName"]
const lastName = "Dupont" as User["lastName"]

// Create the handler for User aggregate
const userCommandHandler = makeCommandHandler({
  tag: UserEventStore,
  initialState: Option.none<User>(),
  evolve,
  decide
})

// =============================================================================
// Tests
// =============================================================================

describe("makeCommandHandler", () => {
  describe("with User aggregate", () => {
    it.effect(
      "CreateUser on empty stream → returns [UserCreated] and persists event",
      () =>
        Effect.gen(function*() {
          const streamId = StreamId(userId)
          const command: CreateUser = {
            _tag: "CreateUser",
            id: userId,
            firstName,
            lastName
          }

          // Execute the command
          const events = yield* userCommandHandler(streamId, command)

          // Should return the emitted events
          expect(events).toEqual([{
            _tag: "UserCreated",
            id: userId,
            firstName,
            lastName
          }])

          // Verify events were persisted
          const store = yield* UserEventStore
          const storedEvents = yield* store.load(streamId)
          expect(storedEvents).toEqual(events)
        }).pipe(Effect.provide(InMemoryUserEventStore))
    )

    it.effect(
      "CreateUser on existing user → returns Left(UserAlreadyExists)",
      () =>
        Effect.gen(function*() {
          const streamId = StreamId(userId)
          const command: CreateUser = {
            _tag: "CreateUser",
            id: userId,
            firstName,
            lastName
          }

          // Pre-populate with existing user
          const store = yield* UserEventStore
          const existingEvent: UserEvent = {
            _tag: "UserCreated",
            id: userId,
            firstName,
            lastName
          }
          yield* store.append(streamId, [existingEvent])

          // Execute the command — should fail
          const result = yield* userCommandHandler(streamId, command).pipe(
            Effect.exit
          )

          // Should be a failure with UserAlreadyExists
          expect(Exit.isFailure(result)).toBe(true)
          if (Exit.isFailure(result)) {
            expect(result.cause).toMatchObject({
              _tag: "Fail",
              error: { _tag: "UserAlreadyExists" }
            })
          }
        }).pipe(Effect.provide(InMemoryUserEventStore))
    )

    it.effect(
      "ChangeFirstName on existing user → returns [FirstNameChanged] and persists",
      () =>
        Effect.gen(function*() {
          const streamId = StreamId(userId)
          const newFirstName = "Pierre" as User["firstName"]

          // Pre-populate with existing user
          const store = yield* UserEventStore
          const existingEvent: UserEvent = {
            _tag: "UserCreated",
            id: userId,
            firstName,
            lastName
          }
          yield* store.append(streamId, [existingEvent])

          // Change first name
          const command: ChangeFirstName = {
            _tag: "ChangeFirstName",
            id: userId,
            firstName: newFirstName
          }
          const events = yield* userCommandHandler(streamId, command)

          // Should return FirstNameChanged
          expect(events).toEqual([{
            _tag: "FirstNameChanged",
            id: userId,
            oldValue: firstName,
            newValue: newFirstName
          }])

          // Verify events were persisted (now 2 events total)
          const storedEvents = yield* store.load(streamId)
          expect(storedEvents).toHaveLength(2)
          expect(storedEvents[1]).toEqual(events[0])
        }).pipe(Effect.provide(InMemoryUserEventStore))
    )

    it.effect(
      "ChangeFirstName on empty stream → returns Left(UserNotFound)",
      () =>
        Effect.gen(function*() {
          const streamId = StreamId(userId)
          const command: ChangeFirstName = {
            _tag: "ChangeFirstName",
            id: userId,
            firstName: "Pierre" as User["firstName"]
          }

          // Execute on empty stream — should fail
          const result = yield* userCommandHandler(streamId, command).pipe(
            Effect.exit
          )

          // Should be a failure with UserNotFound
          expect(Exit.isFailure(result)).toBe(true)
          if (Exit.isFailure(result)) {
            expect(result.cause).toMatchObject({
              _tag: "Fail",
              error: { _tag: "UserNotFound" }
            })
          }
        }).pipe(Effect.provide(InMemoryUserEventStore))
    )

    it.effect(
      "ChangeFirstName with same value → returns [] (no-op, nothing persisted)",
      () =>
        Effect.gen(function*() {
          const streamId = StreamId(userId)

          // Pre-populate with existing user
          const store = yield* UserEventStore
          const existingEvent: UserEvent = {
            _tag: "UserCreated",
            id: userId,
            firstName,
            lastName
          }
          yield* store.append(streamId, [existingEvent])

          // Change to same value
          const command: ChangeFirstName = {
            _tag: "ChangeFirstName",
            id: userId,
            firstName // same as current
          }
          const events = yield* userCommandHandler(streamId, command)

          // Should return empty array (no-op)
          expect(events).toEqual([])

          // Verify no new events were persisted (still just 1 event)
          const storedEvents = yield* store.load(streamId)
          expect(storedEvents).toHaveLength(1)
        }).pipe(Effect.provide(InMemoryUserEventStore))
    )
  })
})
