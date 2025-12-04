import { Schema } from "effect"
import { FirstName, LastName, UserId } from "./State.js"

// =============================================================================
// User Events
// =============================================================================
//
// ES PERSPECTIVE:
// Events are the source of truth in Event Sourcing.
// They represent facts that have happened — immutable, past-tense, never deleted or modified.
//
// Key properties:
//   - Immutable: Once recorded, an event never changes
//   - Past-tense naming: "UserCreated", not "CreateUser" (that's a command)
//   - Complete: Contains all info needed to reconstruct what happened
//   - Ordered: Events in a stream have a sequence; order matters
//
// DDD PERSPECTIVE:
// Events are "Domain Events" — significant occurrences that domain experts
// care about. They capture business meaning, not technical details.
// "UserCreated" is domain language; "RowInserted" is not.
//
// FUNCTIONAL DDD:
// Events are just data — immutable records. No behavior attached.
// They connect the two core functions of an aggregate:
//
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │  decide: (State, Command) → Event[]                                │
//   │    "Given the current state and a command, what events happen?"    │
//   │    This is where business rules live. Pure function, no I/O.       │
//   │    Example: decide(user, ChangeFirstName("Jean"))                  │
//   │             → [FirstNameChanged { oldValue, newValue }]            │
//   └─────────────────────────────────────────────────────────────────────┘
//                                ↓ events
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │  evolve: (State, Event) → State                                    │
//   │    "Given the current state and an event, what's the new state?"   │
//   │    Also pure, no I/O — but even simpler than decide:               │
//   │    - No validation, no rejection — the event already happened      │
//   │    - Mechanical state update, like a fold accumulator              │
//   │    - Never fails — if event exists, it's a fact, just apply it     │
//   │    Example: evolve(user, FirstNameChanged { newValue: "Jean", ... })
//   │             → { ...user, firstName: "Jean" }                       │
//   └─────────────────────────────────────────────────────────────────────┘
//
// The flow: Command → decide → Event(s) → evolve → new State
// Events are the "hinge" between deciding and evolving.
//
// =============================================================================

// -----------------------------------------------------------------------------
// UserCreated
// -----------------------------------------------------------------------------
// Emitted when a new user is created. Contains all initial field values.
// This is the "birth event" — every User stream starts with this.
//
export const UserCreated = Schema.Struct({
  _tag: Schema.Literal("UserCreated"), //     ↳ Literal: A schema that only accepts the exact string "UserCreated".
  id: UserId, //       Used as a discriminator/tag for union types (like sealed trait + case class).
  firstName: FirstName,
  lastName: LastName
})
export type UserCreated = typeof UserCreated.Type

// -----------------------------------------------------------------------------
// FirstNameChanged
// -----------------------------------------------------------------------------
// Emitted when the user's first name is updated.
//
// Design choice: Separate events for FirstName and LastName (not a unified
// `UserNameChanged` with a field discriminator). This provides:
//   - Full type safety: oldValue/newValue are properly branded, no casts needed
//   - Consistency with Address aggregate (which needs separate events for routing)
//   - ES purity: each distinct fact gets its own event type
//
export const FirstNameChanged = Schema.Struct({
  _tag: Schema.Literal("FirstNameChanged"),
  id: UserId,
  oldValue: FirstName,
  newValue: FirstName
})
export type FirstNameChanged = typeof FirstNameChanged.Type

// -----------------------------------------------------------------------------
// LastNameChanged
// -----------------------------------------------------------------------------
// Emitted when the user's last name is updated.
//
export const LastNameChanged = Schema.Struct({
  _tag: Schema.Literal("LastNameChanged"),
  id: UserId,
  oldValue: LastName,
  newValue: LastName
})
export type LastNameChanged = typeof LastNameChanged.Type

// =============================================================================
// UserEvent (union of all events)
// =============================================================================
//
// EFFECT SYNTAX:
//   Schema.Union(A, B, ...)
//     ↳ Creates a schema for a discriminated union. Like `sealed trait` in Scala.
//       Effect uses the `_tag` field as the discriminator by convention.
//       Pattern matching on `_tag` narrows the type automatically.
//
// Usage in evolve:
//   switch (event._tag) {
//     case "UserCreated": ...      // TS knows event is UserCreated here
//     case "FirstNameChanged": ... // TS knows event is FirstNameChanged here
//     case "LastNameChanged": ...  // TS knows event is LastNameChanged here
//   }
//
export const UserEvent = Schema.Union(UserCreated, FirstNameChanged, LastNameChanged)
export type UserEvent = typeof UserEvent.Type
