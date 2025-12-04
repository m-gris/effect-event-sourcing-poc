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
//   │             → [UserNameChanged { field: "firstName", ... }]        │
//   └─────────────────────────────────────────────────────────────────────┘
//                                ↓ events
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │  evolve: (State, Event) → State                                    │
//   │    "Given the current state and an event, what's the new state?"   │
//   │    Also pure, no I/O — but even simpler than decide:               │
//   │    - No validation, no rejection — the event already happened      │
//   │    - Mechanical state update, like a fold accumulator              │
//   │    - Never fails — if event exists, it's a fact, just apply it     │
//   │    Example: evolve(user, UserNameChanged { field: "firstName", ... })
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
// UserNameChanged
// -----------------------------------------------------------------------------
// Emitted when either firstName or lastName is updated.
//
// Design choice: One event type with a `field` discriminator, not separate
// `FirstNameChanged` / `LastNameChanged` events.
//
// Why? Per the domain spec, name changes don't trigger emails — they're
// treated uniformly. Separate events would add complexity without benefit.
// (Contrast with Address, where each field triggers a *different* email.)
//
export const UserNameField = Schema.Literal("firstName", "lastName")
export type UserNameField = typeof UserNameField.Type

export const UserNameChanged = Schema.Struct({
  _tag: Schema.Literal("UserNameChanged"),
  id: UserId,
  // Q: What if both firstName AND lastName change at once?
  // A: Per domain spec, single-field edits are enforced at the UI level.
  //    If we *did* allow multi-field edits, we'd emit TWO events, not one:
  //    [UserNameChanged{field:"firstName",...}, UserNameChanged{field:"lastName",...}]
  //    Each fact recorded separately — that's the ES way.
  field: UserNameField,
  // `oldValue` and `newValue` are plain strings here, not branded.
  // The branding ensures correct *input* at command time; in the event
  // we just record what was observed. Reconstructing state will re-brand.
  oldValue: Schema.String,
  newValue: Schema.String
})
export type UserNameChanged = typeof UserNameChanged.Type

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
//     case "UserCreated": ... // TS knows event is UserCreated here
//     case "UserNameChanged": ... // TS knows event is UserNameChanged here
//   }
//
export const UserEvent = Schema.Union(UserCreated, UserNameChanged)
export type UserEvent = typeof UserEvent.Type
