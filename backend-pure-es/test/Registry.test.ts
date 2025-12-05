// =============================================================================
// TDD: Registry — In-Memory Lookup Indexes
// =============================================================================
//
// The Registry is a "poor man's read model" — maps human-readable identifiers
// to aggregate IDs. It's updated after each successful command.
//
// Three lookups:
//   - nickname → userId
//   - (userId, label) → addressId
//   - revertToken → addressId
//
// EFFECT PATTERN:
// Uses Ref<RegistryState> for explicit mutable state.
// Lookups return Effect<Option<Id>, never> — effectful read, absence is Option.
//
import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import type { UserId } from "../src/domain/user/State.js"
import type { AddressId, RevertToken } from "../src/domain/address/State.js"

// Will fail until we implement — TDD!
import {
  Registry,
  makeRegistryLayer
} from "../src/Registry.js"

// =============================================================================
// Test Fixtures
// =============================================================================

const userId = "user-123" as UserId
const addressId = "addr-456" as AddressId
const nickname = "jean-dupont"
const label = "home"
const token = "token-abc" as RevertToken

// =============================================================================
// Tests
// =============================================================================

describe("Registry", () => {
  // ---------------------------------------------------------------------------
  // Nickname → UserId
  // ---------------------------------------------------------------------------
  describe("nickname lookup", () => {
    it.effect("returns None for unknown nickname", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        const result = yield* registry.getUserIdByNickname("unknown")

        expect(result).toEqual(Option.none())
      }).pipe(Effect.provide(makeRegistryLayer()))
    )

    it.effect("returns Some(userId) after registration", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        yield* registry.registerUser(nickname, userId)
        const result = yield* registry.getUserIdByNickname(nickname)

        expect(result).toEqual(Option.some(userId))
      }).pipe(Effect.provide(makeRegistryLayer()))
    )
  })

  // ---------------------------------------------------------------------------
  // (UserId, Label) → AddressId
  // ---------------------------------------------------------------------------
  describe("address lookup by label", () => {
    it.effect("returns None for unknown (userId, label)", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        const result = yield* registry.getAddressIdByLabel(userId, label)

        expect(result).toEqual(Option.none())
      }).pipe(Effect.provide(makeRegistryLayer()))
    )

    it.effect("returns Some(addressId) after registration", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        yield* registry.registerAddress(userId, label, addressId)
        const result = yield* registry.getAddressIdByLabel(userId, label)

        expect(result).toEqual(Option.some(addressId))
      }).pipe(Effect.provide(makeRegistryLayer()))
    )

    it.effect("different users can have same label", () =>
      Effect.gen(function* () {
        const registry = yield* Registry
        const otherUserId = "user-other" as UserId
        const otherAddressId = "addr-other" as AddressId

        yield* registry.registerAddress(userId, label, addressId)
        yield* registry.registerAddress(otherUserId, label, otherAddressId)

        const result1 = yield* registry.getAddressIdByLabel(userId, label)
        const result2 = yield* registry.getAddressIdByLabel(otherUserId, label)

        expect(result1).toEqual(Option.some(addressId))
        expect(result2).toEqual(Option.some(otherAddressId))
      }).pipe(Effect.provide(makeRegistryLayer()))
    )
  })

  // ---------------------------------------------------------------------------
  // RevertToken → AddressId
  // ---------------------------------------------------------------------------
  describe("token lookup", () => {
    it.effect("returns None for unknown token", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        const result = yield* registry.getAddressIdByToken(token)

        expect(result).toEqual(Option.none())
      }).pipe(Effect.provide(makeRegistryLayer()))
    )

    it.effect("returns Some(addressId) after registration", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        yield* registry.registerToken(token, addressId)
        const result = yield* registry.getAddressIdByToken(token)

        expect(result).toEqual(Option.some(addressId))
      }).pipe(Effect.provide(makeRegistryLayer()))
    )

    it.effect("returns None after token is unregistered", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        yield* registry.registerToken(token, addressId)
        yield* registry.unregisterToken(token)
        const result = yield* registry.getAddressIdByToken(token)

        expect(result).toEqual(Option.none())
      }).pipe(Effect.provide(makeRegistryLayer()))
    )
  })
})
