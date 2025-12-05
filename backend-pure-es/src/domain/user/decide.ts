// TYPE ALIAS TRICK (see evolve.ts for full explanation)
import { Either as E, Option as O } from "effect"

type Option<A> = O.Option<A>
const Option = O

// =============================================================================
// EFFECT vs SCALA: Either type parameter order
// =============================================================================
//
// Effect:  Either<Success, Error>   →  Either<UserEvent[], UserError>
// Scala:   Either[Error, Success]   →  Either[UserError, List[UserEvent]]
//
// Effect puts success FIRST to match `Effect<A, E, R>` (success, error, requirements).
// Both are "right-biased" — map/flatMap operate on the success channel.
//
// The functions work the same way in both:
//   Either.right(value)  →  success (the A / first param in Effect)
//   Either.left(error)   →  failure (the E / second param in Effect)
//
// If you're coming from Scala, just remember: Effect flips the type params,
// but Right is still success and Left is still error.
//
type Either<A, Err> = E.Either<A, Err>
const Either = E
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

// UserAlreadyExists: tried to create a user that already exists
// CreateUser has "birth" semantics — a user can only be born once.
export type UserAlreadyExists = {
  readonly _tag: "UserAlreadyExists"
}

// Union of all possible errors from User aggregate
export type UserError = UserNotFound | UserAlreadyExists

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
): Either<Array<UserEvent>, UserError> => {
  switch (command._tag) {
    case "CreateUser":
      // BIRTH SEMANTICS: A user can only be created once.
      // If already exists → error, not silent no-op.
      // This makes the command's meaning unambiguous.
      if (Option.isSome(state)) {
        return Either.left({ _tag: "UserAlreadyExists" as const })
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
            _tag: "FirstNameChanged" as const,
            id: command.id,
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
            _tag: "LastNameChanged" as const,
            id: command.id,
            oldValue: user.lastName,
            newValue: command.lastName
          }])
        }
      })
  }
}
