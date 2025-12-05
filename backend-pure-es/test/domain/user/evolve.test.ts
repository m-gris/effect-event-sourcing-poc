// =============================================================================
// TDD: Testing `evolve`
// =============================================================================
//
// WHY TEST EVOLVE?
// `evolve` is a pure function: (State, Event) → State
// Pure functions are ideal for unit testing:
//   - No mocks needed — just data in, data out
//   - Deterministic — same inputs always produce same outputs
//   - Fast — no I/O, no setup/teardown
//
// TDD APPROACH:
// 1. RED:   Write tests first (this file) — tests fail because evolve doesn't exist
// 2. GREEN: Implement evolve to make tests pass
// 3. REFACTOR: Clean up while tests keep us safe
//
// EFFECT/VITEST:
// @effect/vitest wraps vitest with Effect-aware utilities.
// For pure functions like `evolve`, it's just standard vitest — describe/it/expect.
// Effect-specific test helpers (like `it.effect`) are for testing effectful code.
//
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { evolve } from "../../../src/domain/user/evolve.js"
// TS SYNTAX: `import type` — import only the type, not the runtime value.
// Ensures no runtime code is pulled in; purely for type-checking.
import type { FirstNameChanged, LastNameChanged, UserCreated } from "../../../src/domain/user/Events.js"
import type { User } from "../../../src/domain/user/State.js"

// =============================================================================
// Test Fixtures
// =============================================================================
// Helper values to keep tests focused on behavior, not boilerplate.
// Using type assertions to bypass Schema validation in tests:
// we're testing evolve logic, not Schema parsing.
//
// TS JARGON: "Type assertion" (not "cast")
//   `"user-123" as User["id"]`
//
// This is NOT a runtime cast (like Java/C). It's a compile-time directive:
// "Trust me, compiler — treat this string as a UserId."
// At runtime, it's still just a string. No conversion happens.
//
// SCALA ANALOGY: `.asInstanceOf[T]` but without runtime checking.
// It's purely a type-level annotation for the compiler.
//
// `User["id"]` is TS syntax for "the type of the `id` field of User" — lookup type.
//
const userId = "user-123" as User["id"]
const email = "jean@example.com" as User["email"]
const firstName = "Jean" as User["firstName"]
const lastName = "Dupont" as User["lastName"]

const existingUser: User = {
  id: userId,
  email,
  firstName,
  lastName
}

// =============================================================================
// evolve tests
// =============================================================================
//
// TEST STRUCTURE:
//   describe("evolve", ...)     — groups all tests for the `evolve` function
//     describe("UserCreated")   — groups tests for one event type
//       it("scenario → expected") — individual test case
//
// NAMING CONVENTION:
//   "InputEvent on InputState → expected outcome"
//   Reads like documentation; mirrors the function signature.
//

describe("evolve", () => {
  describe("UserCreated", () => {
    it("UserCreated on None → Some(User) with id, firstName, lastName", () => {
      const event: UserCreated = {
        _tag: "UserCreated",
        id: userId,
        email,
        firstName,
        lastName
      }

      const result = evolve(Option.none(), event)

      expect(result).toEqual(Option.some({
        id: userId,
        email,
        firstName,
        lastName
      }))
    })
  })

  describe("FirstNameChanged", () => {
    it("FirstNameChanged on Some(User) → Some(User) with firstName updated", () => {
      const newFirstName = "Pierre" as User["firstName"]
      const event: FirstNameChanged = {
        _tag: "FirstNameChanged",
        id: userId,
        oldValue: firstName,
        newValue: newFirstName
      }

      const result = evolve(Option.some(existingUser), event)

      expect(result).toEqual(Option.some({
        id: userId,
        email,
        firstName: newFirstName,
        lastName // unchanged
      }))
    })
  })

  describe("LastNameChanged", () => {
    it("LastNameChanged on Some(User) → Some(User) with lastName updated", () => {
      const newLastName = "Martin" as User["lastName"]
      const event: LastNameChanged = {
        _tag: "LastNameChanged",
        id: userId,
        oldValue: lastName,
        newValue: newLastName
      }

      const result = evolve(Option.some(existingUser), event)

      expect(result).toEqual(Option.some({
        id: userId,
        email,
        firstName, // unchanged
        lastName: newLastName
      }))
    })
  })
})
