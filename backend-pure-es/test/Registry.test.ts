// =============================================================================
// TDD: Registry — Event-Sourced Read Model (Projection)
// =============================================================================
//
// The Registry is a PROJECTION — a read model derived from events.
// It subscribes to domain events and builds lookup indexes.
//
// Three lookups:
//   - nickname → userId       (from UserCreated events)
//   - (userId, label) → addressId  (from AddressCreated events)
//   - revertToken → addressId      (from events with revertToken)
//
// EVENT-DRIVEN:
// Registry.project(event) updates internal state based on event type.
// No imperative register* calls — state is derived from events.
//
// EFFECT PATTERN:
// Uses Ref<RegistryState> for explicit mutable state.
// Lookups return Effect<Option<Id>, never> — effectful read, absence is Option.
//
import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import type { UserId, FirstName, LastName } from "../src/domain/user/State.js"
import { Email } from "../src/shared/Email.js"
import type { UserEvent } from "../src/domain/user/Events.js"
import type { AddressEvent } from "../src/domain/address/Events.js"
import type { Address, AddressId, RevertToken } from "../src/domain/address/State.js"

import { Registry } from "../src/Registry.js"
import { makeInMemoryRegistryLayer } from "../src/infrastructure/InMemoryRegistry.js"

// =============================================================================
// Test Fixtures
// =============================================================================

const userId = "user-123" as UserId
const email = Email.make("jean.dupont@example.com")
const firstName = "Jean" as FirstName
const lastName = "Dupont" as LastName
const expectedNickname = "jean-dupont" // derived from firstName-lastName

const addressId = "addr-456" as AddressId
const label = "Home" as Address["label"]
const token = "token-abc" as RevertToken

// Base address data for events
const baseAddressData = {
  id: addressId,
  userId,
  label,
  streetNumber: "42" as Address["streetNumber"],
  streetName: "Rue de Rivoli" as Address["streetName"],
  zipCode: "75001" as Address["zipCode"],
  city: "Paris" as Address["city"],
  country: "France" as Address["country"]
}

// =============================================================================
// Tests
// =============================================================================

describe("Registry", () => {
  // ---------------------------------------------------------------------------
  // Nickname → UserId (projected from UserCreated)
  // ---------------------------------------------------------------------------
  describe("nickname lookup", () => {
    it.effect("returns None for unknown nickname", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        const result = yield* registry.getUserIdByNickname("unknown")

        expect(result).toEqual(Option.none())
      }).pipe(Effect.provide(makeInMemoryRegistryLayer()))
    )

    it.effect("returns Some(userId) after projecting UserCreated", () =>
      Effect.gen(function* () {
        const registry = yield* Registry
        const event: UserEvent = {
          _tag: "UserCreated",
          id: userId,
          email,
          firstName,
          lastName
        }

        yield* registry.projectUserEvent(event)
        const result = yield* registry.getUserIdByNickname(expectedNickname)

        expect(result).toEqual(Option.some(userId))
      }).pipe(Effect.provide(makeInMemoryRegistryLayer()))
    )

    it.effect("nickname is lowercase hyphenated", () =>
      Effect.gen(function* () {
        const registry = yield* Registry
        const event: UserEvent = {
          _tag: "UserCreated",
          id: userId,
          email,
          firstName: "Jean Pierre" as FirstName,
          lastName: "De La Fontaine" as LastName
        }

        yield* registry.projectUserEvent(event)

        // Nickname should be lowercase, spaces become hyphens
        const result = yield* registry.getUserIdByNickname("jean-pierre-de-la-fontaine")
        expect(result).toEqual(Option.some(userId))
      }).pipe(Effect.provide(makeInMemoryRegistryLayer()))
    )
  })

  // ---------------------------------------------------------------------------
  // (UserId, Label) → AddressId (projected from AddressCreated)
  // ---------------------------------------------------------------------------
  describe("address lookup by label", () => {
    it.effect("returns None for unknown (userId, label)", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        const result = yield* registry.getAddressIdByLabel(userId, label)

        expect(result).toEqual(Option.none())
      }).pipe(Effect.provide(makeInMemoryRegistryLayer()))
    )

    it.effect("returns Some(addressId) after projecting AddressCreated", () =>
      Effect.gen(function* () {
        const registry = yield* Registry
        const event: AddressEvent = {
          _tag: "AddressCreated",
          revertToken: token,
          ...baseAddressData
        }

        yield* registry.projectAddressEvent(event)
        const result = yield* registry.getAddressIdByLabel(userId, label)

        expect(result).toEqual(Option.some(addressId))
      }).pipe(Effect.provide(makeInMemoryRegistryLayer()))
    )

    it.effect("different users can have same label", () =>
      Effect.gen(function* () {
        const registry = yield* Registry
        const otherUserId = "user-other" as UserId
        const otherAddressId = "addr-other" as AddressId
        const otherToken = "token-other" as RevertToken

        const event1: AddressEvent = {
          _tag: "AddressCreated",
          revertToken: token,
          ...baseAddressData
        }
        const event2: AddressEvent = {
          _tag: "AddressCreated",
          revertToken: otherToken,
          id: otherAddressId,
          userId: otherUserId,
          label,
          streetNumber: "10" as Address["streetNumber"],
          streetName: "Other Street" as Address["streetName"],
          zipCode: "75002" as Address["zipCode"],
          city: "Paris" as Address["city"],
          country: "France" as Address["country"]
        }

        yield* registry.projectAddressEvent(event1)
        yield* registry.projectAddressEvent(event2)

        const result1 = yield* registry.getAddressIdByLabel(userId, label)
        const result2 = yield* registry.getAddressIdByLabel(otherUserId, label)

        expect(result1).toEqual(Option.some(addressId))
        expect(result2).toEqual(Option.some(otherAddressId))
      }).pipe(Effect.provide(makeInMemoryRegistryLayer()))
    )

    it.effect("returns None after projecting CreationReverted", () =>
      Effect.gen(function* () {
        const registry = yield* Registry
        const createEvent: AddressEvent = {
          _tag: "AddressCreated",
          revertToken: token,
          ...baseAddressData
        }
        const revertEvent: AddressEvent = {
          _tag: "CreationReverted",
          id: addressId,
          revertToken: token
        }

        yield* registry.projectAddressEvent(createEvent)
        yield* registry.projectAddressEvent(revertEvent)
        const result = yield* registry.getAddressIdByLabel(userId, label)

        expect(result).toEqual(Option.none())
      }).pipe(Effect.provide(makeInMemoryRegistryLayer()))
    )
  })

  // ---------------------------------------------------------------------------
  // RevertToken → AddressId (projected from events with revertToken)
  // ---------------------------------------------------------------------------
  describe("token lookup", () => {
    it.effect("returns None for unknown token", () =>
      Effect.gen(function* () {
        const registry = yield* Registry

        const result = yield* registry.getAddressIdByToken(token)

        expect(result).toEqual(Option.none())
      }).pipe(Effect.provide(makeInMemoryRegistryLayer()))
    )

    it.effect("returns Some(addressId) after projecting AddressCreated", () =>
      Effect.gen(function* () {
        const registry = yield* Registry
        const event: AddressEvent = {
          _tag: "AddressCreated",
          revertToken: token,
          ...baseAddressData
        }

        yield* registry.projectAddressEvent(event)
        const result = yield* registry.getAddressIdByToken(token)

        expect(result).toEqual(Option.some(addressId))
      }).pipe(Effect.provide(makeInMemoryRegistryLayer()))
    )

    it.effect("returns Some(addressId) after projecting CityChanged", () =>
      Effect.gen(function* () {
        const registry = yield* Registry
        const event: AddressEvent = {
          _tag: "CityChanged",
          id: addressId,
          revertToken: token,
          oldValue: "Paris" as Address["city"],
          newValue: "Lyon" as Address["city"]
        }

        yield* registry.projectAddressEvent(event)
        const result = yield* registry.getAddressIdByToken(token)

        expect(result).toEqual(Option.some(addressId))
      }).pipe(Effect.provide(makeInMemoryRegistryLayer()))
    )

    it.effect("returns None after projecting *Reverted (token consumed)", () =>
      Effect.gen(function* () {
        const registry = yield* Registry
        const changeEvent: AddressEvent = {
          _tag: "CityChanged",
          id: addressId,
          revertToken: token,
          oldValue: "Paris" as Address["city"],
          newValue: "Lyon" as Address["city"]
        }
        const revertEvent: AddressEvent = {
          _tag: "CityReverted",
          id: addressId,
          revertToken: token,
          oldValue: "Lyon" as Address["city"],
          newValue: "Paris" as Address["city"]
        }

        yield* registry.projectAddressEvent(changeEvent)
        yield* registry.projectAddressEvent(revertEvent)
        const result = yield* registry.getAddressIdByToken(token)

        expect(result).toEqual(Option.none())
      }).pipe(Effect.provide(makeInMemoryRegistryLayer()))
    )
  })
})
