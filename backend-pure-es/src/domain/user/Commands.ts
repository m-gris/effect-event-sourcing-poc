import { Schema } from "effect"
import { Email } from "../../shared/Email.js"
import { FirstName, LastName, UserId } from "./State.js"

// =============================================================================
// User Commands
// =============================================================================
//
// DDD / ES PERSPECTIVE:
// Commands express *intent* — what someone wants to happen.
// They are requests, not guarantees. The system may reject them.
//
//   Command: "I want to change my first name to Jean"
//   Event:   "First name was changed to Jean"  (only if accepted)
//
// Key differences from Events:
//   - Commands are imperative/present: "CreateUser", "ChangeFirstName"
//   - Events are past-tense facts: "UserCreated", "UserNameChanged"
//   - Commands can be rejected; Events are immutable history
//   - Commands carry desired values; Events carry what actually happened
//
// FUNCTIONAL DDD:
// Commands are just data — immutable records describing intent.
// No methods, no behavior. They're input to the `decide` function:
//
//   decide(currentState, command) → Event[] | Error
//
// "But commands are verbs — shouldn't they be functions?"
//
// Commands are "reified verbs" — the verb turned into a noun (data).
//
//   OOP approach:        user.changeFirstName("Jean")     ← method call
//   Functional approach: ChangeFirstName { id, "Jean" }   ← data structure
//
// Why reify the verb into data?
//   - Decoupling: request is separate from handler. Serialize, queue, log, replay.
//   - Testability: `decide(state, command)` — just data in, data out.
//   - Auditability: store commands alongside events (what was requested vs what happened).
//
// SCALA ANALOGY:
// Think of it like an Akka message: `case class ChangeFirstName(userId, firstName)`
// The command is the arguments packaged as data. The "verb" (function) is `decide`.
//
// =============================================================================

// -----------------------------------------------------------------------------
// CreateUser
// -----------------------------------------------------------------------------
// Intent: create a new user with the given name.
// Will be rejected if... (for User, not much can go wrong — names just need
// to be non-empty, which is enforced by the types themselves).
//
export const CreateUser = Schema.Struct({
  _tag: Schema.Literal("CreateUser"),
  id: UserId,
  email: Email.schema,
  firstName: FirstName,
  lastName: LastName
})
export type CreateUser = typeof CreateUser.Type

// -----------------------------------------------------------------------------
// ChangeFirstName
// -----------------------------------------------------------------------------
// Intent: change the user's first name.
// Note: We use separate commands for FirstName and LastName (unlike the single
// UserNameChanged event) because commands represent distinct user intents.
// The UI has separate "edit first name" and "edit last name" actions.
//
export const ChangeFirstName = Schema.Struct({
  _tag: Schema.Literal("ChangeFirstName"),
  id: UserId,
  firstName: FirstName // The new desired value
})
export type ChangeFirstName = typeof ChangeFirstName.Type

// -----------------------------------------------------------------------------
// ChangeLastName
// -----------------------------------------------------------------------------
export const ChangeLastName = Schema.Struct({
  _tag: Schema.Literal("ChangeLastName"),
  id: UserId,
  lastName: LastName
})
export type ChangeLastName = typeof ChangeLastName.Type

// =============================================================================
// UserCommand (union of all commands)
// =============================================================================
//
// Same pattern as UserEvent — discriminated union via `_tag`.
// Used in the `decide` function signature:
//
//   const decide = (state: User | null, command: UserCommand): UserEvent[]
//
export const UserCommand = Schema.Union(CreateUser, ChangeFirstName, ChangeLastName)
export type UserCommand = typeof UserCommand.Type
