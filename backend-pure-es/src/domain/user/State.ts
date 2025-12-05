// Effect uses a single "effect" package that re-exports all modules.
// `Schema` is the module for defining types with runtime validation.
// Other common imports: `Effect` (the core monad), `Context` (DI), `Layer` (wiring).
import { Schema } from "effect"

// =============================================================================
// Value Objects (branded types)
// =============================================================================
//
// DDD PERSPECTIVE:
// Value Objects vs Entities — the key distinction:
//
//   ENTITY: Has identity. Two users with the same name are still different users.
//           You track them by ID, and they can change over time.
//           Example: User { id: "123", firstName: "Jean" }
//
//   VALUE OBJECT: No identity. Defined purely by its attributes.
//           Two "Jean" FirstNames are interchangeable — same value, same thing.
//           You don't ask "which Jean?" — "Jean" is just "Jean".
//           Example: FirstName("Jean"), Money(100, "EUR"), Address("10 rue...")
//
// Why does this matter?
//   - Entities: compare by ID (`user1.id === user2.id`)
//   - Value Objects: compare by value (`firstName1 === firstName2`)
//
// Value Objects also encapsulate validation. A FirstName can't be empty —
// that rule lives *inside* the type, not scattered across the codebase.
//
// EFFECT PERSPECTIVE:
// @effect/schema provides "branded types" — compile-time distinct types that
// share the same runtime representation (string). This prevents accidentally
// passing a UserId where an AddressId is expected, caught at compile time.
//
// SCALA ANALOGY:
// - `Schema.brand("X")` ≈ `opaque type X = String` or `newtype X = String`
// - `Schema.filter(...)` ≈ `refined` predicates (NonEmptyString, Positive, etc.)
// - The schema itself ≈ `circe` Codec + `refined` combined
//
// =============================================================================

// UserId: a string that is tagged as a user identifier.
//
// Why branded? Without branding, UserId and AddressId would both be `string`,
// and the compiler couldn't catch `getUser(addressId)` mistakes.
// With branding, they're distinct types — type safety without runtime cost.
export const UserId = Schema.String // Base string schema (like scala's circe's Codec[String])
  .pipe( // .pipe = composition, like F#'s |> operator
    Schema.brand("UserId") // Adds compile-time tag: string & Brand<"UserId">
  ) // Runtime: still a string. Compile-time: distinct type.
// NOTE: Why .pipe()? TS lacks extension methods. In Scala you'd chain (str.brand("X")),
// but TS can't add methods to existing types. .pipe() is Effect's universal workaround,
// used across Schema, Effect, Stream, etc.

export type UserId = typeof UserId.Type // Every Schema has .Type — extracts the TS type

// NonEmptyString: a string that cannot be empty.
//
// DDD: This is a reusable constraint — "non-emptiness" is a domain rule
// that applies to multiple fields (firstName, lastName, label, etc.).
export const NonEmptyString = Schema.String.pipe(
  Schema.filter( // Adds runtime validation (like `refined` in Scala)
    (s) => s.trim().length > 0, // Predicate: true = valid, false = error
    { message: () => "String must not be empty" } // Error is a value, not a thrown exception
  )
)

// FirstName & LastName: branded non-empty strings.
//
// Why separate types for FirstName and LastName?
// They're semantically different — you shouldn't be able to do:
//   updateLastName(user.firstName)  // This should be a compile error!
//
// Branding makes them distinct at compile time while both are just strings
// at runtime. Zero runtime overhead, maximum type safety.
export const FirstName = NonEmptyString.pipe(Schema.brand("FirstName"))
export type FirstName = typeof FirstName.Type

export const LastName = NonEmptyString.pipe(Schema.brand("LastName"))
export type LastName = typeof LastName.Type

// =============================================================================
// User State (Aggregate Root)
// =============================================================================
//
// DDD PERSPECTIVE:
// In DDD, an Aggregate is a cluster of domain objects treated as a single unit.
// The Aggregate Root (here: User) is the entry point — all access to the
// aggregate goes through it. External code never holds references to internals.
//
// For User, the aggregate is trivial — just the root with no child entities.
// (Address is a *separate* aggregate, not nested inside User.)
//
// ES PERSPECTIVE:
// In Event Sourcing, State is *derived*, not stored directly. You don't save
// the User object — you save the events that created it. The current state
// is reconstructed by folding (reducing) all events:
//
//   const currentState = events.reduce(evolve, initialState)
//
// This State type represents what the User looks like at any point in time,
// computed from the event history up to that point.
//
// FUNCTIONAL DDD (Wlaschin):
// State is just data — an immutable record. Behavior lives in functions
// (`decide`, `evolve`), not methods on the object. No `user.changeName()`,
// instead `decide(state, ChangeNameCommand)` returns events.
//
// =============================================================================

export const User = Schema.Struct({ // Defines object schema — like a Scala case class
  id: UserId, // Each field is itself a schema
  firstName: FirstName, // Validation is recursive: any field fails = struct fails
  lastName: LastName
})
// WHY ISN'T ADDRESS NESTED IN USER?
// Aggregate boundaries are about consistency, not ownership.
// "Does User have addresses?" — yes, conceptually.
// "Must they be consistent in a single transaction?" — no.
// Changing an address doesn't require updating User; they're independent.
// See Address/State.ts for more on this design choice.
//

// Schema defines both runtime validator AND static type
export type User = typeof User.Type // Extracts: { id: UserId, firstName: FirstName, lastName: LastName }
