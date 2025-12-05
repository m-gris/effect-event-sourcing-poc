// =============================================================================
// TDD: InMemoryEventStore
// =============================================================================
//
// We test the in-memory implementation of EventStore.
// This validates our interface design and provides a working store for
// development/testing before we build the Postgres adapter.
//
// EFFECT TESTING:
// Since load/append return Effect, we use @effect/vitest's `it.effect`
// which runs the Effect and unwraps the result for assertions.
//
// TEST STRUCTURE:
// 1. load on non-existent stream → empty array
// 2. append then load → returns appended events
// 3. append multiple times → events accumulate in order
// 4. separate streams are isolated
//
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { StreamId } from "../../src/EventStore.js"

// We'll test with a simple event type (not importing domain events to keep tests focused)
type TestEvent =
  | { readonly _tag: "EventA"; readonly value: string }
  | { readonly _tag: "EventB"; readonly value: number }

// Import will fail until we create the implementation — that's TDD!
// The test file drives the implementation.
import { makeInMemoryEventStore } from "../../src/infrastructure/InMemoryEventStore.js"

describe("InMemoryEventStore", () => {
  // ---------------------------------------------------------------------------
  // load
  // ---------------------------------------------------------------------------
  describe("load", () => {
    it.effect("on non-existent stream → returns empty array", () =>
      Effect.gen(function* () {
        const store = makeInMemoryEventStore<TestEvent>()
        const streamId = StreamId("stream-1")

        const events = yield* store.load(streamId)

        expect(events).toEqual([])
      })
    )

    it.effect("after append → returns appended events", () =>
      Effect.gen(function* () {
        const store = makeInMemoryEventStore<TestEvent>()
        const streamId = StreamId("stream-1")
        const event1: TestEvent = { _tag: "EventA", value: "hello" }
        const event2: TestEvent = { _tag: "EventB", value: 42 }

        yield* store.append(streamId, [event1, event2])
        const events = yield* store.load(streamId)

        expect(events).toEqual([event1, event2])
      })
    )

    it.effect("multiple appends → events accumulate in order", () =>
      Effect.gen(function* () {
        const store = makeInMemoryEventStore<TestEvent>()
        const streamId = StreamId("stream-1")
        const event1: TestEvent = { _tag: "EventA", value: "first" }
        const event2: TestEvent = { _tag: "EventB", value: 1 }
        const event3: TestEvent = { _tag: "EventA", value: "third" }

        yield* store.append(streamId, [event1])
        yield* store.append(streamId, [event2, event3])
        const events = yield* store.load(streamId)

        expect(events).toEqual([event1, event2, event3])
      })
    )
  })

  // ---------------------------------------------------------------------------
  // Stream isolation
  // ---------------------------------------------------------------------------
  describe("stream isolation", () => {
    it.effect("events in one stream don't affect another", () =>
      Effect.gen(function* () {
        const store = makeInMemoryEventStore<TestEvent>()
        const stream1 = StreamId("stream-1")
        const stream2 = StreamId("stream-2")
        const event1: TestEvent = { _tag: "EventA", value: "for-stream-1" }
        const event2: TestEvent = { _tag: "EventB", value: 99 }

        yield* store.append(stream1, [event1])
        yield* store.append(stream2, [event2])

        const events1 = yield* store.load(stream1)
        const events2 = yield* store.load(stream2)

        expect(events1).toEqual([event1])
        expect(events2).toEqual([event2])
      })
    )
  })

  // ---------------------------------------------------------------------------
  // append with empty array
  // ---------------------------------------------------------------------------
  describe("append edge cases", () => {
    it.effect("append empty array → no-op, load still works", () =>
      Effect.gen(function* () {
        const store = makeInMemoryEventStore<TestEvent>()
        const streamId = StreamId("stream-1")

        yield* store.append(streamId, [])
        const events = yield* store.load(streamId)

        expect(events).toEqual([])
      })
    )

    it.effect("append empty array to existing stream → no change", () =>
      Effect.gen(function* () {
        const store = makeInMemoryEventStore<TestEvent>()
        const streamId = StreamId("stream-1")
        const event1: TestEvent = { _tag: "EventA", value: "existing" }

        yield* store.append(streamId, [event1])
        yield* store.append(streamId, [])
        const events = yield* store.load(streamId)

        expect(events).toEqual([event1])
      })
    )
  })
})
