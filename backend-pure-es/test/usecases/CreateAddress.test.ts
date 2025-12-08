// =============================================================================
// TDD: CreateAddress Use Case
// =============================================================================
//
// USE CASE LAYER:
// Orchestrates the full flow for creating an address:
//   1. Lookup user by nickname (need userId + email)
//   2. Check label uniqueness for this user
//   3. Generate addressId and revertToken
//   4. Execute CreateAddress command
//   5. Project events to Registry
//   6. React to events (SEND EMAIL!)
//   7. Return created address
//
// THIS IS THE FIRST USE CASE THAT TRIGGERS AN EMAIL!
//
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { Email } from "../../src/shared/Email.js"
import type { FirstName, LastName, UserId } from "../../src/domain/user/State.js"
import type { Address } from "../../src/domain/address/State.js"
import { Registry } from "../../src/Registry.js"
import { makeInMemoryRegistryLayer } from "../../src/infrastructure/InMemoryRegistry.js"
import { InMemoryUserEventStore, InMemoryAddressEventStore } from "../../src/infrastructure/InMemoryEventStore.js"
import { TestIdGeneratorLive } from "../../src/IdGenerator.js"
import { EmailService } from "../../src/EmailService.js"
import { makeCaptureEmailService } from "../../src/infrastructure/ConsoleEmailService.js"

// Will fail until we implement — that's TDD!
import { createAddress } from "../../src/usecases/CreateAddress.js"
import { createUser } from "../../src/usecases/CreateUser.js"

// =============================================================================
// Test Fixtures
// =============================================================================

const testEmail = Email.make("jean.dupont@example.com")
const testFirstName = "Jean" as FirstName
const testLastName = "Dupont" as LastName
const testNickname = "jean-dupont"

const testAddressData = {
  label: "Home" as Address["label"],
  streetNumber: "42" as Address["streetNumber"],
  streetName: "Rue de Rivoli" as Address["streetName"],
  zipCode: "75001" as Address["zipCode"],
  city: "Paris" as Address["city"],
  country: "France" as Address["country"]
}

// =============================================================================
// Tests
// =============================================================================

describe("createAddress", () => {
  it.effect("creates address and returns it", () =>
    Effect.gen(function* () {
      // Setup: create user first
      yield* createUser({
        email: testEmail,
        firstName: testFirstName,
        lastName: testLastName
      })

      // Act: create address
      const result = yield* createAddress({
        nickname: testNickname,
        ...testAddressData
      })

      expect(result.label).toBe(testAddressData.label)
      expect(result.city).toBe(testAddressData.city)
      expect(result.id).toBeDefined()
    }).pipe(
      Effect.provide(Layer.mergeAll(
        InMemoryUserEventStore,
        InMemoryAddressEventStore,
        makeInMemoryRegistryLayer(),
        TestIdGeneratorLive,
        Layer.succeed(EmailService, makeCaptureEmailService().service)
      ))
    )
  )

  it.effect("projects AddressCreated to Registry", () =>
    Effect.gen(function* () {
      // Setup: create user first
      const user = yield* createUser({
        email: testEmail,
        firstName: testFirstName,
        lastName: testLastName
      })

      // Act: create address
      const address = yield* createAddress({
        nickname: testNickname,
        ...testAddressData
      })

      // Verify address was registered in Registry
      const registry = yield* Registry
      const addressId = yield* registry.getAddressIdByLabel(user.id as UserId, testAddressData.label)

      expect(Option.isSome(addressId)).toBe(true)
      expect(Option.getOrNull(addressId)).toBe(address.id)
    }).pipe(
      Effect.provide(Layer.mergeAll(
        InMemoryUserEventStore,
        InMemoryAddressEventStore,
        makeInMemoryRegistryLayer(),
        TestIdGeneratorLive,
        Layer.succeed(EmailService, makeCaptureEmailService().service)
      ))
    )
  )

  it.effect("sends email on address creation", () => {
    // Create capture outside Effect.gen so we can access it for assertions
    const capture = makeCaptureEmailService()

    return Effect.gen(function* () {
      // Setup: create user first
      yield* createUser({
        email: testEmail,
        firstName: testFirstName,
        lastName: testLastName
      })

      // Act: create address
      yield* createAddress({
        nickname: testNickname,
        ...testAddressData
      })

      // Verify email was sent
      const sent = capture.getSentEmails()
      expect(sent).toHaveLength(1)
      expect(sent[0].to).toBe(testEmail)
      expect(sent[0].subject.toLowerCase()).toContain("address")
    }).pipe(
      Effect.provide(Layer.mergeAll(
        InMemoryUserEventStore,
        InMemoryAddressEventStore,
        makeInMemoryRegistryLayer(),
        TestIdGeneratorLive,
        Layer.succeed(EmailService, capture.service)
      ))
    )
  })

  it.effect("fails if user not found", () =>
    Effect.gen(function* () {
      const result = yield* createAddress({
        nickname: "unknown-user",
        ...testAddressData
      }).pipe(Effect.either)

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left).toMatchObject({ _tag: "UserNotFound" })
      }
    }).pipe(
      Effect.provide(Layer.mergeAll(
        InMemoryUserEventStore,
        InMemoryAddressEventStore,
        makeInMemoryRegistryLayer(),
        TestIdGeneratorLive,
        Layer.succeed(EmailService, makeCaptureEmailService().service)
      ))
    )
  )

  it.effect("fails if label already exists for user", () =>
    Effect.gen(function* () {
      // Setup: create user and first address
      yield* createUser({
        email: testEmail,
        firstName: testFirstName,
        lastName: testLastName
      })
      yield* createAddress({
        nickname: testNickname,
        ...testAddressData
      })

      // Try to create second address with same label
      const result = yield* createAddress({
        nickname: testNickname,
        ...testAddressData // same label
      }).pipe(Effect.either)

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left).toMatchObject({ _tag: "LabelAlreadyExists" })
      }
    }).pipe(
      Effect.provide(Layer.mergeAll(
        InMemoryUserEventStore,
        InMemoryAddressEventStore,
        makeInMemoryRegistryLayer(),
        TestIdGeneratorLive,
        Layer.succeed(EmailService, makeCaptureEmailService().service)
      ))
    )
  )
})
