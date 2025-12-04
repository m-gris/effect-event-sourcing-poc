// =============================================================================
// TDD: Testing `decide`
// =============================================================================
//
// `decide` is where business logic lives: (State, Command) → Either<Error, Event[]>
//
// EFFECT: Either<E, A> is like Scala's Either — Left for error, Right for success.
// For pure functions (no I/O), Either is simpler than Effect<A, E, R>.
// Unlike `evolve` (mechanical), `decide` makes decisions:
//   - Can this command be executed given the current state?
//   - If yes, what events result?
//   - If no, what error?
//
// We test incrementally: one test → make it pass → next test.
//
import { describe, expect, it } from "@effect/vitest"
import { Either, Option } from "effect"
import type { ChangeFirstName, CreateUser } from "../../../src/domain/user/Commands.js"
import { decide } from "../../../src/domain/user/decide.js"
import type { User } from "../../../src/domain/user/State.js"

// =============================================================================
// Test Fixtures
// =============================================================================

const userId = "user-123" as User["id"]
const firstName = "Jean" as User["firstName"]
const lastName = "Dupont" as User["lastName"]

// =============================================================================
// decide tests
// =============================================================================

describe("decide", () => {
  describe("CreateUser", () => {
    it("CreateUser on None → Right([UserCreated])", () => {
      const command: CreateUser = {
        _tag: "CreateUser",
        id: userId,
        firstName,
        lastName
      }

      const result = decide(Option.none(), command)

      // EFFECT SYNTAX: Either.right(value) — success case (like Scala's Right)
      expect(result).toEqual(Either.right([{
        _tag: "UserCreated",
        id: userId,
        firstName,
        lastName
      }]))
    })

    it("CreateUser on Some(User) → Right([]) (idempotent no-op)", () => {
      // IDEMPOTENCY PATTERN:
      // CreateUser means "ensure user exists", not "birth a new user".
      // If user already exists, intent is satisfied → no events, no error.
      // This makes the system resilient to retries and duplicates.
      const existingUser: User = { id: userId, firstName, lastName }
      const command: CreateUser = {
        _tag: "CreateUser",
        id: userId,
        firstName,
        lastName
      }

      const result = decide(Option.some(existingUser), command)

      expect(result).toEqual(Either.right([]))
    })
  })

  describe("ChangeFirstName", () => {
    it("ChangeFirstName on Some(User) → Right([UserNameChanged])", () => {
      const existingUser: User = { id: userId, firstName, lastName }
      const newFirstName = "Pierre" as User["firstName"]
      const command: ChangeFirstName = {
        _tag: "ChangeFirstName",
        id: userId,
        firstName: newFirstName
      }

      const result = decide(Option.some(existingUser), command)

      expect(result).toEqual(Either.right([{
        _tag: "UserNameChanged",
        id: userId,
        field: "firstName",
        oldValue: firstName,
        newValue: newFirstName
      }]))
    })

    it("ChangeFirstName on None → Left(UserNotFound)", () => {
      // ERROR AS VALUE:
      // Can't change firstName of a user that doesn't exist.
      // We return Left(error) — the error is data, not an exception.
      // Caller can pattern match on it, no try/catch needed.
      const newFirstName = "Pierre" as User["firstName"]
      const command: ChangeFirstName = {
        _tag: "ChangeFirstName",
        id: userId,
        firstName: newFirstName
      }

      const result = decide(Option.none(), command)

      expect(result).toEqual(Either.left({ _tag: "UserNotFound" }))
    })
  })
})
