import { Schema } from "effect"
import { UserId } from "../user/State.js"
import {
  AddressId,
  City,
  Country,
  Label,
  RevertToken,
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
  revertToken: RevertToken,  // Token for the safety email revert link
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
    revertToken: RevertToken,   // Token for the safety email revert link
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
// Also includes revertToken for the safety email.
//
export const AddressDeleted = Schema.Struct({
  _tag: Schema.Literal("AddressDeleted"),
  id: AddressId,
  revertToken: RevertToken,
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
// Field Reverted Events (generated from config)
// =============================================================================
//
// Mirror of *Changed events, but for reverting a change.
// Each carries the revertToken that was used (to mark it as consumed).
//
// DESIGN: *Reverted events have the same structure as *Changed events
// (oldValue/newValue) but semantically represent "undoing" a previous change.
// The oldValue is what we're reverting FROM (the changed value),
// the newValue is what we're reverting TO (the original value).
//

const makeFieldRevertedEvent = <
  Tag extends string,
  S extends Schema.Schema.Any
>(tag: Tag, schema: S) =>
  Schema.Struct({
    _tag: Schema.Literal(tag),
    id: AddressId,
    revertToken: RevertToken,
    oldValue: schema,  // The value we're reverting from (post-change)
    newValue: schema   // The value we're reverting to (pre-change)
  })

const fieldRevertedEvents = {
  LabelReverted: makeFieldRevertedEvent("LabelReverted", addressFields.label),
  StreetNumberReverted: makeFieldRevertedEvent("StreetNumberReverted", addressFields.streetNumber),
  StreetNameReverted: makeFieldRevertedEvent("StreetNameReverted", addressFields.streetName),
  ZipCodeReverted: makeFieldRevertedEvent("ZipCodeReverted", addressFields.zipCode),
  CityReverted: makeFieldRevertedEvent("CityReverted", addressFields.city),
  CountryReverted: makeFieldRevertedEvent("CountryReverted", addressFields.country)
} as const

export const {
  LabelReverted,
  StreetNumberReverted,
  StreetNameReverted,
  ZipCodeReverted,
  CityReverted,
  CountryReverted
} = fieldRevertedEvents

export type LabelReverted = typeof LabelReverted.Type
export type StreetNumberReverted = typeof StreetNumberReverted.Type
export type StreetNameReverted = typeof StreetNameReverted.Type
export type ZipCodeReverted = typeof ZipCodeReverted.Type
export type CityReverted = typeof CityReverted.Type
export type CountryReverted = typeof CountryReverted.Type

// =============================================================================
// Correction Events (Terminal — NOT revertable)
// =============================================================================
//
// KEY INSIGHT (Wlaschin/De Goes): There are TWO kinds of events:
//
// 1. USER ACTIONS: AddressCreated, *Changed, AddressDeleted
//    - Represent intentional user changes
//    - Carry a revertToken → revertable (user might have made a mistake)
//    - When reverted, the token is consumed and removed from pendingReverts
//
// 2. CORRECTIONS: *Reverted, AddressRestored, CreationReverted
//    - Represent "undoing a mistake"
//    - Do NOT issue new tokens → terminal (you don't undo a correction)
//    - If you could revert a revert, you'd have infinite undo chains
//
// This distinction prevents the "newRevertToken → newNewRevertToken → ..." trap.
// Corrections are final. If user reverts by mistake, they redo the original action.
//

// -----------------------------------------------------------------------------
// CreationReverted
// -----------------------------------------------------------------------------
// Emitted when an address creation is reverted (user decides they didn't
// want to create this address after all).
//
// EFFECT: Sets address to null (like AddressDeleted) but:
//   - Does NOT issue a new revert token (this is a correction, not a deletion)
//   - Consumes the original creation token
//
// WHY NOT JUST USE AddressDeleted?
// AddressDeleted is a user action — it issues a new token, making the deletion
// revertable. CreationReverted is a correction — terminal, no new token.
//
export const CreationReverted = Schema.Struct({
  _tag: Schema.Literal("CreationReverted"),
  id: AddressId,
  revertToken: RevertToken  // The consumed token (for audit trail)
})
export type CreationReverted = typeof CreationReverted.Type

// -----------------------------------------------------------------------------
// AddressRestored
// -----------------------------------------------------------------------------
// Emitted when a deleted address is restored via revert link.
// Contains all fields to recreate the address from the snapshot.
//
// This is a CORRECTION event — terminal, no new token issued.
// (The revertToken here is the consumed deletion token, not a new one.)
//
export const AddressRestored = Schema.Struct({
  _tag: Schema.Literal("AddressRestored"),
  id: AddressId,
  revertToken: RevertToken,  // The consumed token (for audit trail)
  userId: UserId,
  label: Label,
  streetNumber: StreetNumber,
  streetName: StreetName,
  zipCode: ZipCode,
  city: City,
  country: Country
})
export type AddressRestored = typeof AddressRestored.Type

// =============================================================================
// AddressEvent (union of all events)
// =============================================================================

export const AddressEvent = Schema.Union(
  // User actions (revertable)
  AddressCreated,
  ...Object.values(fieldChangedEvents),
  AddressDeleted,
  // Corrections (terminal)
  ...Object.values(fieldRevertedEvents),
  CreationReverted,
  AddressRestored
)
export type AddressEvent = typeof AddressEvent.Type
