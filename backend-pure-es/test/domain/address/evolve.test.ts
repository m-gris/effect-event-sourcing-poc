// =============================================================================
// TDD: Testing Address `evolve`
// =============================================================================
//
// PARAMETRIZED TESTS:
// Address has 6 editable fields, each with its own *Changed event.
// Instead of writing 6 nearly-identical test cases, we define a config
// and iterate over it with `describe.each`.
//
// TS + VITEST:
// `describe.each(cases)` runs the describe block once per case.
// We use `as const` and type assertions to keep things type-safe enough
// while avoiding boilerplate. The Schema definitions are the true type guards;
// tests verify runtime behavior.
//
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import type { AddressEvent } from "../../../src/domain/address/Events.js"
import type { Address } from "../../../src/domain/address/State.js"
import { evolve } from "../../../src/domain/address/evolve.js"

// =============================================================================
// Test Fixtures
// =============================================================================

const addressId = "addr-123" as Address["id"]
const userId = "user-456" as Address["userId"]

const baseAddress: Address = {
  id: addressId,
  userId,
  label: "Home" as Address["label"],
  streetNumber: "42" as Address["streetNumber"],
  streetName: "Rue de Rivoli" as Address["streetName"],
  zipCode: "75001" as Address["zipCode"],
  city: "Paris" as Address["city"],
  country: "France" as Address["country"]
}

// -----------------------------------------------------------------------------
// Field Test Configuration
// -----------------------------------------------------------------------------
// Each entry defines: field name, event tag, old value (from baseAddress), new value
//
// TS PATTERN: `as const` preserves literal types for the array elements.
// This lets `describe.each` infer the correct types for destructuring.
//
const fieldTestCases = [
  { field: "label", tag: "LabelChanged", newValue: "Work" },
  { field: "streetNumber", tag: "StreetNumberChanged", newValue: "100" },
  { field: "streetName", tag: "StreetNameChanged", newValue: "Avenue Montaigne" },
  { field: "zipCode", tag: "ZipCodeChanged", newValue: "75008" },
  { field: "city", tag: "CityChanged", newValue: "Lyon" },
  { field: "country", tag: "CountryChanged", newValue: "Belgium" }
] as const

// =============================================================================
// evolve tests
// =============================================================================

describe("evolve", () => {
  // ---------------------------------------------------------------------------
  // AddressCreated
  // ---------------------------------------------------------------------------
  describe("AddressCreated", () => {
    it("AddressCreated on None → Some(Address) with all fields", () => {
      const event: AddressEvent = {
        _tag: "AddressCreated",
        id: addressId,
        userId,
        label: baseAddress.label,
        streetNumber: baseAddress.streetNumber,
        streetName: baseAddress.streetName,
        zipCode: baseAddress.zipCode,
        city: baseAddress.city,
        country: baseAddress.country
      }

      const result = evolve(Option.none(), event)

      expect(result).toEqual(Option.some(baseAddress))
    })
  })

  // ---------------------------------------------------------------------------
  // Field Change Events (parametrized)
  // ---------------------------------------------------------------------------
  describe.each(fieldTestCases)("$tag", ({ field, tag, newValue }) => {
    it(`on Some(Address) → updates ${field}`, () => {
      // Construct event dynamically
      // TS N.B: We cast to AddressEvent because TS can't verify the dynamic construction
      // matches the union. The Schema definitions are the source of truth for types.
      const event = {
        _tag: tag,
        id: addressId,
        oldValue: baseAddress[field],
        newValue
      } as AddressEvent

      const result = evolve(Option.some(baseAddress), event)

      // Verify the specific field was updated
      expect(result).toEqual(Option.some({
        ...baseAddress,
        [field]: newValue
      }))
    })

    it(`on None → None (no-op, malformed stream)`, () => {
      // Edge case: event without prior AddressCreated.
      // Shouldn't happen in a well-formed stream, but evolve handles gracefully.
      const event = {
        _tag: tag,
        id: addressId,
        oldValue: baseAddress[field],
        newValue
      } as AddressEvent

      const result = evolve(Option.none(), event)

      expect(result).toEqual(Option.none())
    })
  })

  // ---------------------------------------------------------------------------
  // AddressDeleted
  // ---------------------------------------------------------------------------
  describe("AddressDeleted", () => {
    it("AddressDeleted on Some(Address) → None", () => {
      const event: AddressEvent = {
        _tag: "AddressDeleted",
        id: addressId,
        // Snapshot fields (for restore capability, not used by evolve)
        userId,
        label: baseAddress.label,
        streetNumber: baseAddress.streetNumber,
        streetName: baseAddress.streetName,
        zipCode: baseAddress.zipCode,
        city: baseAddress.city,
        country: baseAddress.country
      }

      const result = evolve(Option.some(baseAddress), event)

      expect(result).toEqual(Option.none())
    })
  })
})
