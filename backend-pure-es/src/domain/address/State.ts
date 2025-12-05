import { Schema } from "effect"
import { UserId } from "../user/State.js"

// =============================================================================
// Value Objects (branded types)
// =============================================================================
//
// Address has more fields than User, but the same pattern applies:
// each field gets a branded type for compile-time safety.
//
// DDD: These are Value Objects — defined by their attributes, no identity.
// Two "Paris" City values are interchangeable.
//

// AddressId: identifies an address aggregate instance.
export const AddressId = Schema.String.pipe(Schema.brand("AddressId"))
export type AddressId = typeof AddressId.Type

// -----------------------------------------------------------------------------
// Address Field Value Objects
// -----------------------------------------------------------------------------
// Each field is a non-empty string with a distinct brand.
// This prevents mixing up Label with City, StreetName with StreetNumber, etc.
//

const NonEmptyString = Schema.String.pipe(
  Schema.filter(
    (s) => s.trim().length > 0,
    { message: () => "String must not be empty" }
  )
)

// Label: user-defined name for the address (e.g., "Home", "Work", "Parents")
export const Label = NonEmptyString.pipe(Schema.brand("Label"))
export type Label = typeof Label.Type

// StreetNumber: the building number (e.g., "123", "45B")
// Kept as string to handle formats like "12A", "1/2", etc.
export const StreetNumber = NonEmptyString.pipe(Schema.brand("StreetNumber"))
export type StreetNumber = typeof StreetNumber.Type

// StreetName: the street name (e.g., "Main Street", "Avenue des Champs-Élysées")
export const StreetName = NonEmptyString.pipe(Schema.brand("StreetName"))
export type StreetName = typeof StreetName.Type

// ZipCode: postal code (e.g., "75001", "SW1A 1AA")
// String because formats vary by country.
export const ZipCode = NonEmptyString.pipe(Schema.brand("ZipCode"))
export type ZipCode = typeof ZipCode.Type

// City: city name (e.g., "Paris", "London", "New York")
export const City = NonEmptyString.pipe(Schema.brand("City"))
export type City = typeof City.Type

// Country: country name (e.g., "France", "United Kingdom")
export const Country = NonEmptyString.pipe(Schema.brand("Country"))
export type Country = typeof Country.Type

// -----------------------------------------------------------------------------
// RevertToken
// -----------------------------------------------------------------------------
// A one-time-use token embedded in safety emails for address changes.
// When clicked, allows reverting the change. Once used, cannot be reused.
//
// DDD: This is a Value Object representing a unique, opaque identifier.
// It's generated when a change event is created and consumed when revert happens.
//
export const RevertToken = NonEmptyString.pipe(Schema.brand("RevertToken"))
export type RevertToken = typeof RevertToken.Type

// =============================================================================
// Address State (Aggregate Root)
// =============================================================================
//
// DDD: Address is a separate aggregate from User (per architecture doc).
// It references User via userId but has its own lifecycle and event stream.
//
// WHY SEPARATE AGGREGATES?
// Aggregate boundaries are about consistency, not ownership.
// The question isn't "does User have addresses?" (yes, conceptually) but
// "must User and Address be consistent in a single transaction?" (no).
//
// - Changing an address doesn't require updating anything on User
// - Changing User's name doesn't require checking any address
// - No invariant spans both (e.g., no "address country must match user locale")
//
// The "has-a" relationship is a reference (userId), not containment.
// Address events live in their own stream, not inside User's stream.
//
// WHAT IF "USER MUST HAVE ≥1 ADDRESS"?
// That invariant would span aggregates. Options:
//   A) Merge into one aggregate (User contains addresses) — enforce in decide
//   B) Enforce at API layer before sending command — pragmatic, good enough
//   C) Eventual consistency + saga — allow violation, compensate after
// For this PoC, no such invariant exists, so separate aggregates are fine.
//
// ES: State is derived from events. The Address struct represents the current
// snapshot at any point in time, computed by folding events.
//

export const Address = Schema.Struct({
  id: AddressId,
  userId: UserId,           // Reference to owning user (not nested — separate aggregate)
  label: Label,
  streetNumber: StreetNumber,
  streetName: StreetName,
  zipCode: ZipCode,
  city: City,
  country: Country
})

export type Address = typeof Address.Type

// =============================================================================
// Revertable Changes (for pending revert tracking)
// =============================================================================
//
// FP DESIGN PRINCIPLE (Wlaschin): "Make illegal states unrepresentable"
//
// Problem: To decide if a revert is valid, we need to know:
//   1. Was this token ever issued? (from a *Changed, AddressCreated, or AddressDeleted event)
//   2. Has it already been consumed? (by a *Reverted or AddressRestored event)
//
// Naive approach: Pass the full event history to `decide` and search it.
// Pure FP approach: Encode this information IN THE STATE.
//
// The state becomes not just "current address values" but also
// "what reverts are still pending (issued but not consumed)".
//
// `evolve` builds this map:
//   - On *Changed/AddressCreated/AddressDeleted → add token to pendingReverts
//   - On *Reverted/AddressRestored → remove token from pendingReverts
//
// `decide` just looks up the token in pendingReverts:
//   - Found → emit the appropriate *Reverted event
//   - Not found → error (token invalid or already used)
//
// This keeps `decide` pure: (State, Command) → Either<Error, Event[]>
// No event history needed — the state already encapsulates what we need.
//

// -----------------------------------------------------------------------------
// AddressFieldName
// -----------------------------------------------------------------------------
// Discriminator for which field was changed. Used in RevertableFieldChange
// to know which *Reverted event to emit.
//
export type AddressFieldName =
  | "label"
  | "streetNumber"
  | "streetName"
  | "zipCode"
  | "city"
  | "country"

// -----------------------------------------------------------------------------
// RevertableFieldChange
// -----------------------------------------------------------------------------
// Represents a field change that can be reverted.
// Stores the field name and both values so we can emit the correct *Reverted event.
//
// WHY STORE BOTH oldValue AND newValue?
// The *Reverted event needs both:
//   - oldValue (in revert context) = the value we're reverting FROM (post-change)
//   - newValue (in revert context) = the value we're reverting TO (pre-change)
//
// These are swapped from the original *Changed event:
//   *Changed:  { oldValue: "Paris", newValue: "Lyon" }   — changed Paris→Lyon
//   *Reverted: { oldValue: "Lyon", newValue: "Paris" }   — reverting Lyon→Paris
//
export type RevertableFieldChange = {
  readonly _tag: "FieldChange"
  readonly field: AddressFieldName
  readonly oldValue: string  // Pre-change value (will become newValue in *Reverted)
  readonly newValue: string  // Post-change value (will become oldValue in *Reverted)
}

// -----------------------------------------------------------------------------
// RevertableCreation
// -----------------------------------------------------------------------------
// Represents an address creation that can be reverted (i.e., deleted).
// Stores the full snapshot so we know what to delete.
//
// REVERT SEMANTICS FOR CREATION:
// If user clicks "undo" on a creation email, we DELETE the address.
// The AddressDeleted event will be emitted (but without a new revertToken,
// since this is itself a revert action, not a new change to undo).
//
// Wait — that's not quite right. Per the flows doc, reverting a creation
// means deleting the address. But should that deletion itself be revertable?
//
// For simplicity in this PoC: reverting creation = hard delete, no further undo.
// The *Reverted event marks the token as consumed; no new token is issued.
//
export type RevertableCreation = {
  readonly _tag: "Creation"
  readonly snapshot: Address  // Full address data for the deletion event
}

// -----------------------------------------------------------------------------
// RevertableDeletion
// -----------------------------------------------------------------------------
// Represents a deletion that can be reverted (i.e., address restored).
// Stores the full snapshot so we can recreate the address.
//
export type RevertableDeletion = {
  readonly _tag: "Deletion"
  readonly snapshot: Address  // Full address data for restoration
}

// -----------------------------------------------------------------------------
// RevertableChange (union)
// -----------------------------------------------------------------------------
// What a pending revert token can undo.
//
export type RevertableChange =
  | RevertableFieldChange
  | RevertableCreation
  | RevertableDeletion

// =============================================================================
// AddressState (enriched aggregate state)
// =============================================================================
//
// This is the FULL state of the Address aggregate, not just the current values.
// It includes:
//   - address: The current address data (or None if deleted/not yet created)
//   - pendingReverts: Map of tokens → what they can undo
//
// WHY A MAP?
// We need O(1) lookup by token. A Map<RevertToken, RevertableChange> gives us:
//   - Fast lookup in `decide` to check if token is valid
//   - Easy removal in `evolve` when a revert is processed
//
// WHY NOT USE effect/Schema FOR THIS?
// Schema is for serialization boundaries (API, persistence).
// AddressState is internal domain state — plain TS types are fine.
// We're not serializing the pendingReverts map; it's rebuilt from events.
//
export type AddressState = {
  readonly address: Address | null  // null = not created yet or deleted
  readonly pendingReverts: ReadonlyMap<RevertToken, RevertableChange>
}

// -----------------------------------------------------------------------------
// Initial State
// -----------------------------------------------------------------------------
// Before any events, the aggregate is empty.
//
export const initialAddressState: AddressState = {
  address: null,
  pendingReverts: new Map()
}
