// =============================================================================
// TDD: Testing Address `evolve`
// =============================================================================
//
// PARAMETRIZED TESTS:
// Address has 6 editable fields, each with its own *Changed event.
// Instead of writing 6 nearly-identical test cases, we define a config
// and iterate over it with `describe.each`.
//
// ENRICHED STATE:
// With the new AddressState structure (address + pendingReverts), tests must:
//   - Pass AddressState instead of Option<Address>
//   - Include revertToken in events
//   - Verify pendingReverts map is correctly populated/cleaned
//
// TS + VITEST:
// `describe.each(cases)` runs the describe block once per case.
// We use `as const` and type assertions to keep things type-safe enough
// while avoiding boilerplate. The Schema definitions are the true type guards;
// tests verify runtime behavior.
//
import { describe, expect, it } from "@effect/vitest"
import type { AddressEvent } from "../../../src/domain/address/Events.js"
import type { Address, AddressState, RevertToken } from "../../../src/domain/address/State.js"
import { initialAddressState } from "../../../src/domain/address/State.js"
import { evolve } from "../../../src/domain/address/evolve.js"

// =============================================================================
// Test Fixtures
// =============================================================================

const addressId = "addr-123" as Address["id"]
const userId = "user-456" as Address["userId"]
const revertToken = "token-abc" as RevertToken

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

// Helper: create state with address but no pending reverts
const stateWithAddress = (address: Address): AddressState => ({
  address,
  pendingReverts: new Map()
})

// Helper: create state with address and specific pending reverts
const stateWithAddressAndReverts = (
  address: Address,
  reverts: AddressState["pendingReverts"]
): AddressState => ({
  address,
  pendingReverts: reverts
})

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
    it("AddressCreated on empty state → state with address + pending revert", () => {
      const event: AddressEvent = {
        _tag: "AddressCreated",
        id: addressId,
        revertToken,
        userId,
        label: baseAddress.label,
        streetNumber: baseAddress.streetNumber,
        streetName: baseAddress.streetName,
        zipCode: baseAddress.zipCode,
        city: baseAddress.city,
        country: baseAddress.country
      }

      const result = evolve(initialAddressState, event)

      // Address should be populated
      expect(result.address).toEqual(baseAddress)
      // Token should be in pendingReverts as Creation
      expect(result.pendingReverts.get(revertToken)).toEqual({
        _tag: "Creation",
        snapshot: baseAddress
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Field Change Events (parametrized)
  // ---------------------------------------------------------------------------
  describe.each(fieldTestCases)("$tag", ({ field, tag, newValue }) => {
    it(`on state with address → updates ${field} + adds pending revert`, () => {
      const fieldRevertToken = `token-${field}` as RevertToken
      // Construct event dynamically
      // TS N.B: We cast to AddressEvent because TS can't verify the dynamic construction
      // matches the union. The Schema definitions are the source of truth for types.
      const event = {
        _tag: tag,
        id: addressId,
        revertToken: fieldRevertToken,
        oldValue: baseAddress[field],
        newValue
      } as AddressEvent

      const result = evolve(stateWithAddress(baseAddress), event)

      // Verify the specific field was updated
      expect(result.address).toEqual({
        ...baseAddress,
        [field]: newValue
      })
      // Verify pending revert was added
      expect(result.pendingReverts.get(fieldRevertToken)).toEqual({
        _tag: "FieldChange",
        field,
        oldValue: baseAddress[field],
        newValue
      })
    })

    it(`on empty state (no address) → address stays null (malformed stream)`, () => {
      // Edge case: event without prior AddressCreated.
      // Shouldn't happen in a well-formed stream, but evolve handles gracefully.
      const event = {
        _tag: tag,
        id: addressId,
        revertToken,
        oldValue: baseAddress[field],
        newValue
      } as AddressEvent

      const result = evolve(initialAddressState, event)

      // Address should remain null
      expect(result.address).toBeNull()
      // But token is still added to pendingReverts (evolve is mechanical)
      expect(result.pendingReverts.has(revertToken)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // AddressDeleted
  // ---------------------------------------------------------------------------
  describe("AddressDeleted", () => {
    it("AddressDeleted on state with address → address null + adds pending revert", () => {
      const deleteToken = "token-delete" as RevertToken
      const event: AddressEvent = {
        _tag: "AddressDeleted",
        id: addressId,
        revertToken: deleteToken,
        // Snapshot fields (for restore capability)
        userId,
        label: baseAddress.label,
        streetNumber: baseAddress.streetNumber,
        streetName: baseAddress.streetName,
        zipCode: baseAddress.zipCode,
        city: baseAddress.city,
        country: baseAddress.country
      }

      const result = evolve(stateWithAddress(baseAddress), event)

      // Address should be null (deleted)
      expect(result.address).toBeNull()
      // Pending revert should contain snapshot for restoration
      expect(result.pendingReverts.get(deleteToken)).toEqual({
        _tag: "Deletion",
        snapshot: baseAddress
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Field Reverted Events (parametrized)
  // ---------------------------------------------------------------------------
  const revertTestCases = [
    { field: "label", tag: "LabelReverted", changedValue: "Work", originalValue: "Home" },
    { field: "streetNumber", tag: "StreetNumberReverted", changedValue: "100", originalValue: "42" },
    { field: "streetName", tag: "StreetNameReverted", changedValue: "Avenue Montaigne", originalValue: "Rue de Rivoli" },
    { field: "zipCode", tag: "ZipCodeReverted", changedValue: "75008", originalValue: "75001" },
    { field: "city", tag: "CityReverted", changedValue: "Lyon", originalValue: "Paris" },
    { field: "country", tag: "CountryReverted", changedValue: "Belgium", originalValue: "France" }
  ] as const

  describe.each(revertTestCases)("$tag", ({ field, tag, changedValue, originalValue }) => {
    it(`on state with changed ${field} → reverts to original + removes pending revert`, () => {
      const fieldRevertToken = `token-${field}` as RevertToken

      // Start with address that has the changed value
      const changedAddress = { ...baseAddress, [field]: changedValue } as Address

      // State has the token in pendingReverts
      const pendingReverts = new Map([
        [fieldRevertToken, { _tag: "FieldChange" as const, field, oldValue: originalValue, newValue: changedValue }]
      ])
      const state = stateWithAddressAndReverts(changedAddress, pendingReverts)

      // Revert event: oldValue is what we're reverting FROM (changedValue),
      // newValue is what we're reverting TO (originalValue)
      const event = {
        _tag: tag,
        id: addressId,
        revertToken: fieldRevertToken,
        oldValue: changedValue,
        newValue: originalValue
      } as AddressEvent

      const result = evolve(state, event)

      // Field should be reverted to original
      expect(result.address).toEqual(baseAddress)
      // Token should be removed from pendingReverts
      expect(result.pendingReverts.has(fieldRevertToken)).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // CreationReverted (correction — terminal)
  // ---------------------------------------------------------------------------
  describe("CreationReverted", () => {
    it("on state with address → address null + removes pending revert", () => {
      const creationToken = "token-creation" as RevertToken

      // State: address exists, token in pendingReverts as Creation
      const pendingReverts = new Map([
        [creationToken, { _tag: "Creation" as const, snapshot: baseAddress }]
      ])
      const state: AddressState = {
        address: baseAddress,
        pendingReverts
      }

      const event: AddressEvent = {
        _tag: "CreationReverted",
        id: addressId,
        revertToken: creationToken
      }

      const result = evolve(state, event)

      // Address should be null (un-created)
      expect(result.address).toBeNull()
      // Token should be removed from pendingReverts (consumed)
      expect(result.pendingReverts.has(creationToken)).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // AddressRestored (correction — terminal)
  // ---------------------------------------------------------------------------
  describe("AddressRestored", () => {
    it("AddressRestored on deleted state → address restored + removes pending revert", () => {
      const restoreToken = "token-restore" as RevertToken

      // State: address deleted, token in pendingReverts
      const pendingReverts = new Map([
        [restoreToken, { _tag: "Deletion" as const, snapshot: baseAddress }]
      ])
      const deletedState: AddressState = {
        address: null,
        pendingReverts
      }

      const event: AddressEvent = {
        _tag: "AddressRestored",
        id: addressId,
        revertToken: restoreToken,
        userId,
        label: baseAddress.label,
        streetNumber: baseAddress.streetNumber,
        streetName: baseAddress.streetName,
        zipCode: baseAddress.zipCode,
        city: baseAddress.city,
        country: baseAddress.country
      }

      const result = evolve(deletedState, event)

      // Address should be restored
      expect(result.address).toEqual(baseAddress)
      // Token should be removed from pendingReverts
      expect(result.pendingReverts.has(restoreToken)).toBe(false)
    })
  })
})
