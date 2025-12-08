// =============================================================================
// PostgresRegistry Tests — TDD
// =============================================================================
//
// INTEGRATION TESTS:
// These tests require a running Postgres instance.
//
// SAME CONTRACT AS IN-MEMORY:
// Verifies the same behavior as InMemoryRegistry.
//
import { describe, expect, it, beforeAll } from "@effect/vitest"
import { Effect, Layer, Option, Redacted } from "effect"
import { PgClient } from "@effect/sql-pg"

import { Registry } from "../../src/Registry.js"
import { PostgresRegistry } from "../../src/infrastructure/PostgresRegistry.js"
import type { UserEvent } from "../../src/domain/user/Events.js"
import type { AddressEvent } from "../../src/domain/address/Events.js"
import type { UserId, FirstName, LastName } from "../../src/domain/user/State.js"
import type { AddressId, RevertToken } from "../../src/domain/address/State.js"
import type { Email } from "../../src/shared/Email.js"

// =============================================================================
// Test Database Configuration
// =============================================================================

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/event_triggers_test"

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

const TestLayer = Layer.provideMerge(PostgresRegistry, TestPgClient)

// =============================================================================
// Tests
// =============================================================================

describe("PostgresRegistry", async () => {
  const postgresAvailable = await isPostgresAvailable()

  describe.skipIf(!postgresAvailable)("with Postgres", () => {
    beforeAll(async () => {
      if (!postgresAvailable) return
      const { Client } = await import("pg")
      const client = new Client({ connectionString: DATABASE_URL })
      await client.connect()
      await client.query("TRUNCATE events, nicknames, address_labels, revert_tokens RESTART IDENTITY")
      await client.end()
    })

    // -------------------------------------------------------------------------
    // Nickname Lookup Tests
    // -------------------------------------------------------------------------

    it.effect("getUserIdByNickname returns None for unknown nickname", () =>
      Effect.gen(function* () {
        const registry = yield* Registry
        const result = yield* registry.getUserIdByNickname("unknown-nickname")
        expect(result).toEqual(Option.none())
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("getUserIdByNickname returns Some after projecting UserCreated", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        const userId = "user-pg-test-1" as UserId
        const event: UserEvent = {
          _tag: "UserCreated",
          id: userId,
          email: "pg@example.com" as Email,
          firstName: "Postgres" as FirstName,
          lastName: "Test" as LastName,
        }

        yield* registry.projectUserEvent(event)

        const result = yield* registry.getUserIdByNickname("postgres-test")
        expect(result).toEqual(Option.some(userId))
      }).pipe(Effect.provide(TestLayer))
    )

    // -------------------------------------------------------------------------
    // Address Label Lookup Tests
    // -------------------------------------------------------------------------

    it.effect("getAddressIdByLabel returns None for unknown label", () =>
      Effect.gen(function* () {
        const registry = yield* Registry
        const result = yield* registry.getAddressIdByLabel("user-123" as UserId, "unknown")
        expect(result).toEqual(Option.none())
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("getAddressIdByLabel returns Some after projecting AddressCreated", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        const userId = "user-pg-addr-test" as UserId
        const addressId = "addr-pg-test-1" as AddressId
        const event: AddressEvent = {
          _tag: "AddressCreated",
          id: addressId,
          userId,
          label: "home" as any,
          streetNumber: "42" as any,
          streetName: "Rue Test" as any,
          zipCode: "75001" as any,
          city: "Paris" as any,
          country: "France" as any,
          revertToken: "token-pg-1" as RevertToken,
        }

        yield* registry.projectAddressEvent(event)

        const result = yield* registry.getAddressIdByLabel(userId, "home")
        expect(result).toEqual(Option.some(addressId))
      }).pipe(Effect.provide(TestLayer))
    )

    // -------------------------------------------------------------------------
    // Token Lookup Tests
    // -------------------------------------------------------------------------

    it.effect("getAddressIdByToken returns None for unknown token", () =>
      Effect.gen(function* () {
        const registry = yield* Registry
        const result = yield* registry.getAddressIdByToken("unknown-token" as RevertToken)
        expect(result).toEqual(Option.none())
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("getAddressIdByToken returns Some after projecting AddressCreated", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        const addressId = "addr-pg-token-test" as AddressId
        const token = "token-pg-lookup" as RevertToken
        const event: AddressEvent = {
          _tag: "AddressCreated",
          id: addressId,
          userId: "user-token-test" as UserId,
          label: "work" as any,
          streetNumber: "1" as any,
          streetName: "Rue Token" as any,
          zipCode: "75002" as any,
          city: "Paris" as any,
          country: "France" as any,
          revertToken: token,
        }

        yield* registry.projectAddressEvent(event)

        const result = yield* registry.getAddressIdByToken(token)
        expect(result).toEqual(Option.some(addressId))
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("token is consumed after revert projection", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        const addressId = "addr-pg-revert" as AddressId
        const token = "token-pg-revert" as RevertToken

        // First create address
        const createEvent: AddressEvent = {
          _tag: "AddressCreated",
          id: addressId,
          userId: "user-revert" as UserId,
          label: "temp" as any,
          streetNumber: "1" as any,
          streetName: "Rue Temp" as any,
          zipCode: "75003" as any,
          city: "Paris" as any,
          country: "France" as any,
          revertToken: token,
        }
        yield* registry.projectAddressEvent(createEvent)

        // Token should exist
        const before = yield* registry.getAddressIdByToken(token)
        expect(Option.isSome(before)).toBe(true)

        // Project a revert (CreationReverted consumes token)
        const revertEvent: AddressEvent = {
          _tag: "CreationReverted",
          id: addressId,
          revertToken: token,
        }
        yield* registry.projectAddressEvent(revertEvent)

        // Token should be consumed (None)
        const after = yield* registry.getAddressIdByToken(token)
        expect(after).toEqual(Option.none())
      }).pipe(Effect.provide(TestLayer))
    )

    // -------------------------------------------------------------------------
    // getAddressIdsByUserId Tests
    // -------------------------------------------------------------------------

    it.effect("getAddressIdsByUserId returns all addresses for a user", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        const userId = "user-multi-addr" as UserId

        const event1: AddressEvent = {
          _tag: "AddressCreated",
          id: "addr-multi-1" as AddressId,
          userId,
          label: "home" as any,
          streetNumber: "1" as any,
          streetName: "Rue Home" as any,
          zipCode: "75001" as any,
          city: "Paris" as any,
          country: "France" as any,
          revertToken: "token-multi-1" as RevertToken,
        }

        const event2: AddressEvent = {
          _tag: "AddressCreated",
          id: "addr-multi-2" as AddressId,
          userId,
          label: "work" as any,
          streetNumber: "2" as any,
          streetName: "Rue Work" as any,
          zipCode: "75002" as any,
          city: "Paris" as any,
          country: "France" as any,
          revertToken: "token-multi-2" as RevertToken,
        }

        yield* registry.projectAddressEvent(event1)
        yield* registry.projectAddressEvent(event2)

        const addresses = yield* registry.getAddressIdsByUserId(userId)
        expect(addresses).toHaveLength(2)
        expect(addresses).toContain("addr-multi-1")
        expect(addresses).toContain("addr-multi-2")
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe.skipIf(postgresAvailable)("without Postgres", () => {
    it("skipped (Postgres not available)", () => {
      expect(true).toBe(true)
    })
  })
})
