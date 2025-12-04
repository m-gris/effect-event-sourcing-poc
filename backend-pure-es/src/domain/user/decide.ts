import { Either, Option } from "effect"
import type { Either as Either } from "effect/Either"
import type { Option as Option } from "effect/Option"
import type { UserCommand } from "./Commands.js"
import type { UserEvent } from "./Events.js"
import type { User } from "./State.js"

// =============================================================================
// Domain Errors
// =============================================================================
//
// DDD PERSPECTIVE:
// Domain errors are part of the ubiquitous language. "UserAlreadyExists" is
// meaningful to domain experts; "Error: duplicate key" is not.
//
// EFFECT/TS PATTERN:
// Errors are discriminated unions (like events/commands). The `_tag` field
// enables pattern matching and type narrowing.
//

// UserNotFound: tried to change/access a user that doesn't exist
export type UserNotFound = {
  readonly _tag: "UserNotFound"
}

// Union of all possible errors from User aggregate
// (Currently just one; more can be added as domain grows)
export type UserError = UserNotFound

// =============================================================================
// decide: (State, Command) → Either<Error, Event[]>
// =============================================================================
//
// ES PERSPECTIVE:
// `decide` is the "command handler". Given current state and a command,
// it decides what events (if any) should be emitted.
//
// KEY PROPERTIES:
//   - Pure: No I/O, no side effects
//   - Business logic lives here: validation, rules, decisions
//   - Returns Either: Left(error) if invalid, Right(events) if valid
//   - Events are facts to be recorded; errors are rejections
//
// FUNCTIONAL DDD:
// `decide` is where domain rules are enforced. Unlike `evolve` (mechanical),
// `decide` makes judgments: "Can this happen? Should this happen?"
//
// EFFECT SYNTAX:
//   Either<E, A> — Left for error (E), Right for success (A)
//   Either.right(value) — create a Right (success)
//   Either.left(error) — create a Left (failure)
//   Like Scala's Either, but with E on the left by convention (error channel)
//
// =============================================================================

export const decide = (
  state: Option<User>,
  command: UserCommand
): Either<UserError, Array<UserEvent>> => {
  switch (command._tag) {
    case "CreateUser":
      // IDEMPOTENCY: CreateUser means "ensure user exists".
      // If already exists → intent satisfied → no-op (empty events, no error).
      if (Option.isSome(state)) {
        return Either.right([])
      }
      return Either.right([{
        _tag: "UserCreated",
        id: command.id,
        firstName: command.firstName,
        lastName: command.lastName
      }])

    case "ChangeFirstName":
      // For now: assume user exists (happy path). Error case comes next test.
      return Option.match(state, {
        // EFFECT SYNTAX: Option.match — pattern match on Option
        // Like Scala's `option match { case None => ... case Some(v) => ... }`
        // ERRORS AS VALUES: return Left(error), not throw, not null
        onNone: () => Either.left({ _tag: "UserNotFound" as const }),
        onSome: (user) => {
          // NO-OP: if value unchanged, nothing to record
          if (user.firstName === command.firstName) {
            return Either.right([])
          }
          return Either.right([{
            _tag: "UserNameChanged" as const,
            id: command.id,
            field: "firstName" as const,
            oldValue: user.firstName,
            newValue: command.firstName
          }])
        }
      })

    case "ChangeLastName":
      return Option.match(state, {
        onNone: () => Either.left({ _tag: "UserNotFound" as const }),
        onSome: (user) => {
          if (user.lastName === command.lastName) {
            return Either.right([])
          }
          return Either.right([{
            _tag: "UserNameChanged" as const,
            id: command.id,
            field: "lastName" as const,
            oldValue: user.lastName,
            newValue: command.lastName
          }])
        }
      })
  }
}
