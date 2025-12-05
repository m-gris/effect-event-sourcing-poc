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
