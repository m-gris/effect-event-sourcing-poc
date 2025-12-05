// TYPE ALIAS TRICK: Import namespace with temp alias, then re-expose both type and namespace.
// 1. `import { Option as O }` — get namespace under temp name
// 2. `type Option<A> = O.Option<A>` — clean type alias
// 3. `const Option = O` — re-expose namespace with original name
// Result: `Option<User>` for types AND `Option.some()` for functions. Best of both worlds.
import { Option as O } from "effect"

type Option<A> = O.Option<A>
const Option = O
import type { UserEvent } from "./Events.js"
import type { User } from "./State.js"

// =============================================================================
// evolve: (State, Event) → State
// =============================================================================
//
// ES PERSPECTIVE:
// `evolve` is the "state rebuilder". Given the current state and an event,
// it returns the new state. It's how you derive current state from event history:
//
//   const currentState = events.reduce(evolve, Option.none())
//
// This is a left fold — events are applied in order, each producing a new state.
//
// KEY PROPERTIES:
//   - Pure: No I/O, no side effects — just data transformation
//   - Total: Handles every event type (exhaustive switch)
//   - Never fails: Events are facts that already happened; just apply them
//   - Mechanical: No business logic, no validation — that's `decide`'s job
//
// FUNCTIONAL DDD:
// `evolve` is the "fold accumulator". It doesn't decide anything; it just
// mechanically applies facts to state. If the event says "firstName changed
// to Jean", evolve updates firstName to Jean. No questions asked.
//
// WHY `Option<User>` FOR STATE?
// Before any events, the aggregate doesn't exist. `Option.none()` represents
// "no user yet" — explicit about absence, no nulls.
// The first event (UserCreated) transitions from None → Some(User).
// After that, state is always Some(User).
//
// EFFECT SYNTAX:
//   `Option.none()` — absent value (like Scala's `None`)
//   `Option.some(value)` — present value (like `Some(value)`)
//   `Option.getOrThrow(opt)` — unwrap or throw (like `.get` — use carefully!)
//   `Option.map`, `Option.flatMap`, `Option.match` — familiar combinators
//
// =============================================================================

export const evolve = (state: Option<User>, event: UserEvent): Option<User> => {
  // TS SYNTAX: `switch` on a discriminated union
  // This is TypeScript's pattern matching equivalent. The `_tag` field acts as
  // the discriminator (like Scala's sealed trait + case class pattern).
  //
  // Inside each `case`, TS "narrows" the type: it knows `event` is specifically
  // `UserCreated`, not just `UserEvent`. You get full type safety on fields.
  //
  // Scala equivalent:
  //   event match {
  //     case UserCreated(id, firstName, lastName) => ...
  //     case FirstNameChanged(id, oldValue, newValue) => ...
  //     case LastNameChanged(id, oldValue, newValue) => ...
  //   }
  //
  switch (event._tag) {
    case "UserCreated":
      // Birth event: create the User from event data.
      // State was None, now it's Some(User).
      return Option.some({
        id: event.id,
        firstName: event.firstName,
        lastName: event.lastName
      })

    case "FirstNameChanged":
      // Update event: modify firstName.
      // We map over the Option — if state is None, this is a no-op (shouldn't happen
      // in a well-formed event stream, but we handle it gracefully).
      //
      // TYPE SAFETY: With separate events, event.newValue is already FirstName (branded).
      // No type assertions needed — the event schema guarantees the correct type.
      return Option.map(state, (user) => ({
        // TS SYNTAX: `...user` — spread operator
        // Copies all properties from `user` into this new object.
        // Like Scala's `.copy()` but copies ALL fields, not specific ones.
        // Similar to Python's `{**dict}` or Rust's `..struct` syntax.
        ...user,
        firstName: event.newValue
      }))

    case "LastNameChanged":
      // Update event: modify lastName.
      return Option.map(state, (user) => ({
        ...user,
        lastName: event.newValue
      }))
  }
}

// =============================================================================
// TS SYNTAX REFERENCE: Computed Property Names
// =============================================================================
//
// Previously, we used a single `UserNameChanged` event with a `field` discriminator,
// and applied it dynamically using computed property names:
//
//   return { ...user, [event.field]: event.newValue }
//
// TS SYNTAX: `[expression]: value` — computed property name
// The expression in brackets is EVALUATED to get the property key.
// If event.field is "firstName", this becomes `firstName: event.newValue`.
//
// NOT like Python's walrus operator `:=` (which is assignment expression).
// This is object literal syntax: `{ [dynamicKey]: value }`
//
// Combined with spread: "copy user, but override the field named by event.field"
// Scala equivalent would need reflection or a Map; TS makes this easy.
//
// WHY WE MOVED AWAY FROM THIS:
// The computed property approach required storing oldValue/newValue as plain strings
// in the event (losing the branded type information). We switched to separate
// FirstNameChanged/LastNameChanged events for full type safety and consistency
// with the Address aggregate (which needs separate events for email routing).
//
