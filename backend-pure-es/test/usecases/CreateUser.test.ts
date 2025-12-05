// =============================================================================
// TDD: CreateUser Use Case
// =============================================================================
//
// USE CASE LAYER:
// Orchestrates the full flow for creating a user:
//   1. Generate userId
//   2. Execute CreateUser command
//   3. Project UserCreated event to Registry
//   4. Return user with derived nickname
//
// NO EMAIL TRIGGERED — user creation is just setup.
//
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { Email } from "../../src/shared/Email.js"
import type { FirstName, LastName } from "../../src/domain/user/State.js"
import { Registry, makeRegistryLayer } from "../../src/Registry.js"
import { InMemoryUserEventStore } from "../../src/infrastructure/InMemoryEventStore.js"
import { TestIdGeneratorLive } from "../../src/IdGenerator.js"

// Will fail until we implement — that's TDD!
import { createUser } from "../../src/usecases/CreateUser.js"

// =============================================================================
// Test Fixtures
// =============================================================================

const testEmail = Email.make("jean.dupont@example.com")
const testFirstName = "Jean" as FirstName
const testLastName = "Dupont" as LastName

// Test layer: combines all dependencies
// Each layer uses Layer.effect internally, so fresh instances per test
const TestLayer = Layer.mergeAll(
  InMemoryUserEventStore,
  makeRegistryLayer(),
  TestIdGeneratorLive
)

// =============================================================================
// Tests
// =============================================================================

describe("createUser", () => {
  it.effect("creates user and returns with nickname", () =>
    Effect.gen(function* () {
      const result = yield* createUser({
        email: testEmail,
        firstName: testFirstName,
        lastName: testLastName
      })

      expect(result.email).toBe(testEmail)
      expect(result.firstName).toBe(testFirstName)
      expect(result.lastName).toBe(testLastName)
      expect(result.nickname).toBe("jean-dupont")
      // ID is generated — just verify it exists and is deterministic
      expect(result.id).toBe("test-1")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("projects UserCreated to Registry", () =>
    Effect.gen(function* () {
      yield* createUser({
        email: testEmail,
        firstName: testFirstName,
        lastName: testLastName
      })

      // Verify nickname was registered
      const registry = yield* Registry
      const userId = yield* registry.getUserIdByNickname("jean-dupont")

      expect(Option.isSome(userId)).toBe(true)
      expect(Option.getOrNull(userId)).toBe("test-1")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("fails if user with same name already exists", () =>
    Effect.gen(function* () {
      // Create first user
      yield* createUser({
        email: testEmail,
        firstName: testFirstName,
        lastName: testLastName
      })

      // Try to create second user with same name (different email)
      const result = yield* createUser({
        email: Email.make("other@example.com"),
        firstName: testFirstName,
        lastName: testLastName
      }).pipe(Effect.either)

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left).toMatchObject({ _tag: "NicknameAlreadyExists" })
      }
    }).pipe(Effect.provide(TestLayer))
  )
})
