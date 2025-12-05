import { Schema } from "effect"
import { UserId } from "../user/State.js"
import {
  AddressId,
  City,
  Country,
  Label,
  StreetName,
  StreetNumber,
  ZipCode
} from "./State.js"

// =============================================================================
// Address Events
// =============================================================================
//
// ES: Events are immutable facts. Each distinct change gets its own event type.
//
// Design choice: Separate events per field (LabelChanged, CityChanged, etc.)
// rather than a single AddressFieldChanged with a field discriminator.
//
// Why?
//   1. Type safety: oldValue/newValue are properly branded (Label, City, etc.)
//   2. Email routing: each field triggers a different email — pattern match on event type
//   3. Consistency: same approach as User aggregate (FirstNameChanged, LastNameChanged)
//   4. ES purity: each distinct fact gets its own event type
//
// BOILERPLATE REDUCTION:
// We use a factory + config approach to generate 6 similar events programmatically.
// This showcases TypeScript's type-level programming capabilities.
// For even more dynamic scenarios (multi-tenant, configurable fields), you'd move
// toward schema-driven events where fields are data, not types.
//
// =============================================================================

// -----------------------------------------------------------------------------
// AddressCreated
// -----------------------------------------------------------------------------
// Emitted when a new address is added. Contains all initial field values.
// This is the "birth event" for an Address aggregate.
//
export const AddressCreated = Schema.Struct({
  _tag: Schema.Literal("AddressCreated"),
  id: AddressId,
  userId: UserId,
  label: Label,
  streetNumber: StreetNumber,
  streetName: StreetName,
  zipCode: ZipCode,
  city: City,
  country: Country
})
export type AddressCreated = typeof AddressCreated.Type

// -----------------------------------------------------------------------------
// Field Change Events (generated from config)
// -----------------------------------------------------------------------------
//
// CONFIG-DRIVEN GENERATION:
// Define the fields once, derive all *Changed events programmatically.
// The factory preserves full type safety — each event has correctly branded
// oldValue/newValue types.
//

// Field configuration: maps field names to their schemas
//
// TS SYNTAX: `as const`
// Without `as const`, TS infers { label: Schema<Label>, ... } — the values are widened.
// With `as const`, TS preserves the exact literal types, making the object deeply readonly.
// SCALA ANALOGY: Like declaring a `val` with explicit singleton types, or using Shapeless
// to preserve type-level information through transformations.
//
const addressFields = {
  label: Label,
  streetNumber: StreetNumber,
  streetName: StreetName,
  zipCode: ZipCode,
  city: City,
  country: Country
} as const

// -----------------------------------------------------------------------------
// Factory Function: Generic Event Schema Generator
// -----------------------------------------------------------------------------
//
// TS SYNTAX: Generic type parameters with constraints
//
//   <Tag extends string, S extends Schema.Schema.Any>
//     ↑                   ↑
//     │                   └── S must be "any Schema" (Effect's way of saying Schema<?, ?, ?>)
//     └── Tag must be a string (but TS will infer the LITERAL, e.g., "LabelChanged")
//
// SCALA ANALOGY:
//   def makeEvent[Tag <: String, S <: Schema[_]](tag: Tag, schema: S): Schema[...] = ...
//
// HOW TYPE INFERENCE WORKS:
// When you call `makeFieldChangedEvent("LabelChanged", Label)`:
//   - TS infers Tag = "LabelChanged" (literal type, not just string)
//   - TS infers S = typeof Label (the specific schema)
//   - The return type becomes Schema.Struct with _tag: "LabelChanged", oldValue: Label, etc.
//
// This is "type-level programming" — the function's return type DEPENDS on its input types.
// Each call produces a differently-typed result, all checked at compile time.
//
// EFFECT SYNTAX: `Schema.Schema.Any`
// Effect's way of expressing "any Schema regardless of its type parameters".
// It's like a wildcard/existential: Schema<?, ?, ?> — we don't care what A, I, R are,
// we just need something that's a Schema so we can use it in Schema.Struct.
//
const makeFieldChangedEvent = <
  Tag extends string,
  S extends Schema.Schema.Any
>(tag: Tag, schema: S) =>
  Schema.Struct({
    _tag: Schema.Literal(tag),  // Schema.Literal(tag) uses the literal type of Tag
    id: AddressId,
    oldValue: schema,           // schema's type flows through — oldValue: S
    newValue: schema            // same type for newValue
  })

// Generate all field change events
//
// Each call to makeFieldChangedEvent infers different types:
//   makeFieldChangedEvent("LabelChanged", Label)
//     → Schema.Struct<{ _tag: "LabelChanged", id: AddressId, oldValue: Label, newValue: Label }>
//   makeFieldChangedEvent("CityChanged", City)
//     → Schema.Struct<{ _tag: "CityChanged", id: AddressId, oldValue: City, newValue: City }>
//
// The `as const` ensures the object keys are preserved as literal types too.
//
const fieldChangedEvents = {
  LabelChanged: makeFieldChangedEvent("LabelChanged", addressFields.label),
  StreetNumberChanged: makeFieldChangedEvent("StreetNumberChanged", addressFields.streetNumber),
  StreetNameChanged: makeFieldChangedEvent("StreetNameChanged", addressFields.streetName),
  ZipCodeChanged: makeFieldChangedEvent("ZipCodeChanged", addressFields.zipCode),
  CityChanged: makeFieldChangedEvent("CityChanged", addressFields.city),
  CountryChanged: makeFieldChangedEvent("CountryChanged", addressFields.country)
} as const

// Export individual events via destructuring
// TS LIMITATION: No macros — we can't programmatically generate `export const X`.
// Unlike Scala 3 (inline/macros) or Rust (proc_macro), TS exports are static.
// Destructuring is the closest we get to reducing repetition.
// For true codegen, you'd use external tools (ts-morph, plop, hygen).
export const {
  LabelChanged,
  StreetNumberChanged,
  StreetNameChanged,
  ZipCodeChanged,
  CityChanged,
  CountryChanged
} = fieldChangedEvents

// Type exports (still manual — TS has no macro to derive these)
export type LabelChanged = typeof LabelChanged.Type
export type StreetNumberChanged = typeof StreetNumberChanged.Type
export type StreetNameChanged = typeof StreetNameChanged.Type
export type ZipCodeChanged = typeof ZipCodeChanged.Type
export type CityChanged = typeof CityChanged.Type
export type CountryChanged = typeof CountryChanged.Type

// -----------------------------------------------------------------------------
// AddressDeleted
// -----------------------------------------------------------------------------
// Emitted when an address is removed.
// Contains a snapshot of all field values for potential restore via revert link.
//
export const AddressDeleted = Schema.Struct({
  _tag: Schema.Literal("AddressDeleted"),
  id: AddressId,
  // Snapshot for restore capability
  userId: UserId,
  label: Label,
  streetNumber: StreetNumber,
  streetName: StreetName,
  zipCode: ZipCode,
  city: City,
  country: Country
})
export type AddressDeleted = typeof AddressDeleted.Type

// =============================================================================
// AddressEvent (union of all events)
// =============================================================================
//
// Note: Revert events (LabelReverted, AddressRestored, etc.) will be added
// when we implement the revert flow. For now, we focus on the core CRUD events.
//

export const AddressEvent = Schema.Union(
  AddressCreated,
  ...Object.values(fieldChangedEvents),
  AddressDeleted
)
export type AddressEvent = typeof AddressEvent.Type
