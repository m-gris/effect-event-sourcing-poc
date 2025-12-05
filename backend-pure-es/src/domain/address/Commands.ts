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
// Address Commands
// =============================================================================
//
// Commands express intent — what someone wants to happen.
// Each field has its own change command (consistent with separate events).
//
// Revert commands (RevertLabelChange, etc.) will be added when we implement
// the revert flow. For now, we focus on core CRUD commands.
//
// SCALING N.B:
// This explicit-per-field approach works for a PoC with ~6 fields.
// For complex apps (50+ entities, multi-tenant, configurable workflows):
//   - Schema-driven events: fields as data, not types (lose type safety, gain flexibility)
//   - Workflow engines (Temporal, Camunda): routing defined in config, not code
//   - Core + Extensions: typed core, tenant customizations in metadata/JsonB
// The pattern remains; the implementation becomes more dynamic.
//

// -----------------------------------------------------------------------------
// CreateAddress
// -----------------------------------------------------------------------------
// Intent: add a new address for a user.
//
export const CreateAddress = Schema.Struct({
  _tag: Schema.Literal("CreateAddress"),
  id: AddressId,
  userId: UserId,
  label: Label,
  streetNumber: StreetNumber,
  streetName: StreetName,
  zipCode: ZipCode,
  city: City,
  country: Country
})
export type CreateAddress = typeof CreateAddress.Type

// -----------------------------------------------------------------------------
// Field Change Commands (generated via factory)
// -----------------------------------------------------------------------------
// Each field has its own command. Factory reduces boilerplate while preserving types.
//
// TS SYNTAX: Generic factory with 3 type parameters
//
//   <Tag extends string, Field extends string, S extends Schema.Schema.Any>
//
// - Tag: the literal string for _tag (e.g., "ChangeCity")
// - Field: the property name (e.g., "city") — used as a computed property key
// - S: the schema type for that field (e.g., typeof City)
//
// TS SYNTAX: Computed property in object literal
//
//   { [field]: schema }
//
// The brackets evaluate `field` at runtime to get the key name.
// If field = "city", this becomes { city: schema }.
// Combined with generics, TS tracks that the key is literally "city", not just string.
//
// TS SYNTAX: Type assertion with `as`
//
//   ) as Schema.Struct<{ ... }>
//
// TS can't always infer computed property types correctly in generics.
// The `as` tells TS "trust me, the return type is this specific shape".
// This is safe because we control the factory — it's not a lie, just helping inference.
//
// TS SYNTAX: Mapped type in the assertion
//
//   { [K in Field]: S }
//
// This creates a type with a single property whose key is Field and value is S.
// If Field = "city" and S = typeof City, this is { city: typeof City }.
// Combined with &, we get the full struct type.
//
const makeChangeCommand = <Tag extends string, Field extends string, S extends Schema.Schema.Any>(
  tag: Tag,
  field: Field,
  schema: S
) =>
  Schema.Struct({
    _tag: Schema.Literal(tag),
    id: AddressId,
    [field]: schema
  }) as Schema.Struct<{
    _tag: Schema.Literal<[Tag]>
    id: typeof AddressId
  } & { [K in Field]: S }>

export const ChangeLabel = makeChangeCommand("ChangeLabel", "label", Label)
export type ChangeLabel = typeof ChangeLabel.Type

export const ChangeStreetNumber = makeChangeCommand("ChangeStreetNumber", "streetNumber", StreetNumber)
export type ChangeStreetNumber = typeof ChangeStreetNumber.Type

export const ChangeStreetName = makeChangeCommand("ChangeStreetName", "streetName", StreetName)
export type ChangeStreetName = typeof ChangeStreetName.Type

export const ChangeZipCode = makeChangeCommand("ChangeZipCode", "zipCode", ZipCode)
export type ChangeZipCode = typeof ChangeZipCode.Type

export const ChangeCity = makeChangeCommand("ChangeCity", "city", City)
export type ChangeCity = typeof ChangeCity.Type

export const ChangeCountry = makeChangeCommand("ChangeCountry", "country", Country)
export type ChangeCountry = typeof ChangeCountry.Type

// -----------------------------------------------------------------------------
// DeleteAddress
// -----------------------------------------------------------------------------
// Intent: remove an address.
//
export const DeleteAddress = Schema.Struct({
  _tag: Schema.Literal("DeleteAddress"),
  id: AddressId
})
export type DeleteAddress = typeof DeleteAddress.Type

// =============================================================================
// AddressCommand (union of all commands)
// =============================================================================

export const AddressCommand = Schema.Union(
  CreateAddress,
  ChangeLabel,
  ChangeStreetNumber,
  ChangeStreetName,
  ChangeZipCode,
  ChangeCity,
  ChangeCountry,
  DeleteAddress
)
export type AddressCommand = typeof AddressCommand.Type
