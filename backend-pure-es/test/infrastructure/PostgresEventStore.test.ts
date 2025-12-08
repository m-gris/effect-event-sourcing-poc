// =============================================================================
// PostgresEventStore Tests — TDD
// =============================================================================
//
// INTEGRATION TESTS:
// These tests require a running Postgres instance.
// Skip in CI if no Postgres available (use describe.skipIf).
//
// SAME CONTRACT AS IN-MEMORY:
// The tests verify the same behavior as InMemoryEventStore.
// If both pass the same tests, they're interchangeable (Liskov).
//
import { describe, expect, it, beforeAll } from "@effect/vitest"
import { Effect, Layer, Redacted } from "effect"
import { PgClient } from "@effect/sql-pg"

import { UserEventStore, AddressEventStore, StreamId } from "../../src/EventStore.js"
import { PostgresEventStores } from "../../src/infrastructure/PostgresEventStore.js"
import type { UserEvent } from "../../src/domain/user/Events.js"
import type { AddressEvent } from "../../src/domain/address/Events.js"
import type { UserId, FirstName, LastName } from "../../src/domain/user/State.js"
import type { Email } from "../../src/shared/Email.js"

// =============================================================================
// Test Database Configuration
// =============================================================================

// Connection string from env or default for local dev
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/event_triggers_test"

// Check if Postgres is available
const isPostgresAvailable = async (): Promise<boolean> => {
  try {
    const { Client } = await import("pg")
    const client = new Client({ connectionString: DATABASE_URL })
    await client.connect()
    await client.end()
    return true
  } catch {
    return false
  }
}

// =============================================================================
// Test Layer Setup
// =============================================================================

const TestPgClient = PgClient.layer({
  url: Redacted.make(DATABASE_URL),
})

const TestLayer = Layer.provideMerge(PostgresEventStores, TestPgClient)

// =============================================================================
// Tests
// =============================================================================

describe("PostgresEventStore", async () => {
  const postgresAvailable = await isPostgresAvailable()

  // Skip all tests if Postgres not available
  describe.skipIf(!postgresAvailable)("with Postgres", () => {
    // Clean up tables before tests
    beforeAll(async () => {
      if (!postgresAvailable) return
      const { Client } = await import("pg")
      const client = new Client({ connectionString: DATABASE_URL })
      await client.connect()
      await client.query("TRUNCATE events, nicknames, address_labels, revert_tokens RESTART IDENTITY")
      await client.end()
    })

    // ---------------------------------------------------------------------------
    // load() Tests
    // ---------------------------------------------------------------------------

    it.effect("load returns empty array for non-existent stream", () =>
      Effect.gen(function* () {
        const store = yield* UserEventStore
        const events = yield* store.load(StreamId("nonexistent-user-id"))
        expect(events).toEqual([])
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("load returns events in insertion order", () =>
      Effect.gen(function* () {
        const store = yield* UserEventStore
        const streamId = StreamId("user-order-test")

        const event1: UserEvent = {
          _tag: "UserCreated",
          id: "user-order-test" as UserId,
          email: "test@example.com" as Email,
          firstName: "First" as FirstName,
          lastName: "User" as LastName,
        }

        const event2: UserEvent = {
          _tag: "FirstNameChanged",
          id: "user-order-test" as UserId,
          oldValue: "First" as FirstName,
          newValue: "Updated" as FirstName,
        }

        yield* store.append(streamId, [event1])
        yield* store.append(streamId, [event2])

        const events = yield* store.load(streamId)
        expect(events).toHaveLength(2)
        expect(events[0]._tag).toBe("UserCreated")
        expect(events[1]._tag).toBe("FirstNameChanged")
      }).pipe(Effect.provide(TestLayer))
    )

    // ---------------------------------------------------------------------------
    // append() Tests
    // ---------------------------------------------------------------------------

    it.effect("append creates stream and stores events", () =>
      Effect.gen(function* () {
        const store = yield* UserEventStore
        const streamId = StreamId("user-append-test")

        const event: UserEvent = {
          _tag: "UserCreated",
          id: "user-append-test" as UserId,
          email: "append@example.com" as Email,
          firstName: "Append" as FirstName,
          lastName: "Test" as LastName,
        }

        yield* store.append(streamId, [event])

        const events = yield* store.load(streamId)
        expect(events).toHaveLength(1)
        expect(events[0]).toEqual(event)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("append is no-op for empty array", () =>
      Effect.gen(function* () {
        const store = yield* UserEventStore
        const streamId = StreamId("user-empty-append")

        yield* store.append(streamId, [])

        const events = yield* store.load(streamId)
        expect(events).toEqual([])
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("append adds to existing stream", () =>
      Effect.gen(function* () {
        const store = yield* UserEventStore
        const streamId = StreamId("user-multi-append")

        const event1: UserEvent = {
          _tag: "UserCreated",
          id: "user-multi-append" as UserId,
          email: "multi@example.com" as Email,
          firstName: "Multi" as FirstName,
          lastName: "Append" as LastName,
        }

        const event2: UserEvent = {
          _tag: "LastNameChanged",
          id: "user-multi-append" as UserId,
          oldValue: "Append" as LastName,
          newValue: "Changed" as LastName,
        }

        yield* store.append(streamId, [event1])
        yield* store.append(streamId, [event2])

        const events = yield* store.load(streamId)
        expect(events).toHaveLength(2)
      }).pipe(Effect.provide(TestLayer))
    )

    // ---------------------------------------------------------------------------
    // Stream Isolation Tests
    // ---------------------------------------------------------------------------

    it.effect("streams are isolated (different streamIds don't interfere)", () =>
      Effect.gen(function* () {
        const store = yield* UserEventStore
        const streamId1 = StreamId("user-isolated-1")
        const streamId2 = StreamId("user-isolated-2")

        const event1: UserEvent = {
          _tag: "UserCreated",
          id: "user-isolated-1" as UserId,
          email: "iso1@example.com" as Email,
          firstName: "Iso" as FirstName,
          lastName: "One" as LastName,
        }

        const event2: UserEvent = {
          _tag: "UserCreated",
          id: "user-isolated-2" as UserId,
          email: "iso2@example.com" as Email,
          firstName: "Iso" as FirstName,
          lastName: "Two" as LastName,
        }

        yield* store.append(streamId1, [event1])
        yield* store.append(streamId2, [event2])

        const events1 = yield* store.load(streamId1)
        const events2 = yield* store.load(streamId2)

        expect(events1).toHaveLength(1)
        expect(events2).toHaveLength(1)
        expect((events1[0] as any).lastName).toBe("One")
        expect((events2[0] as any).lastName).toBe("Two")
      }).pipe(Effect.provide(TestLayer))
    )

    // ---------------------------------------------------------------------------
    // Address Events (different aggregate)
    // ---------------------------------------------------------------------------

    it.effect("AddressEventStore works independently", () =>
      Effect.gen(function* () {
        const store = yield* AddressEventStore
        const streamId = StreamId("address-test-1")

        const event: AddressEvent = {
          _tag: "AddressCreated",
          id: "address-test-1" as any,
          userId: "user-123" as any,
          label: "home" as any,
          streetNumber: "42" as any,
          streetName: "Rue de Rivoli" as any,
          zipCode: "75001" as any,
          city: "Paris" as any,
          country: "France" as any,
          revertToken: "token-123" as any,
        }

        yield* store.append(streamId, [event])
        const events = yield* store.load(streamId)

        expect(events).toHaveLength(1)
        expect(events[0]._tag).toBe("AddressCreated")
      }).pipe(Effect.provide(TestLayer))
    )
  })

  // Placeholder test when Postgres not available
  describe.skipIf(postgresAvailable)("without Postgres", () => {
    it("skipped (Postgres not available)", () => {
      console.log("PostgresEventStore tests skipped — no Postgres connection")
      expect(true).toBe(true)
    })
  })
})
