// =============================================================================
// TDD: Testing Address `decide`
// =============================================================================
//
// `decide` is where business logic lives: (State, Command) → Either<Event[], Error>
//
// ENRICHED STATE:
// With the new AddressState structure (address + pendingReverts), tests must:
//   - Pass AddressState instead of Option<Address>
//   - Include revertToken in commands
//   - Verify correct events are emitted with tokens
//   - Test RevertChange command with pendingReverts lookup
//
// We test incrementally, one scenario at a time.
//
import { describe, expect, it } from "@effect/vitest"
import { Either } from "effect"
import type { AddressCommand, CreateAddress } from "../../../src/domain/address/Commands.js"
import { decide } from "../../../src/domain/address/decide.js"
import type { Address, AddressState, RevertToken } from "../../../src/domain/address/State.js"
import { initialAddressState } from "../../../src/domain/address/State.js"

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
  address: Address | null,
  reverts: AddressState["pendingReverts"]
): AddressState => ({
  address,
  pendingReverts: reverts
})

// =============================================================================
// decide tests
// =============================================================================

describe("decide", () => {
  // ---------------------------------------------------------------------------
  // CreateAddress
  // ---------------------------------------------------------------------------
  describe("CreateAddress", () => {
    it("CreateAddress on empty state → Right([AddressCreated]) with revertToken", () => {
      const command: CreateAddress = {
        _tag: "CreateAddress",
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

      const result = decide(initialAddressState, command)

      expect(result).toEqual(Either.right([{
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
      }]))
    })

    it("CreateAddress on state with address → Left(AddressAlreadyExists)", () => {
      const command: CreateAddress = {
        _tag: "CreateAddress",
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

      const result = decide(stateWithAddress(baseAddress), command)

      expect(result).toEqual(Either.left({ _tag: "AddressAlreadyExists" }))
    })
  })

  // ---------------------------------------------------------------------------
  // Field Change Commands (parametrized)
  // ---------------------------------------------------------------------------
  // Config: field name, command tag, event tag, new value
  //
  const fieldTestCases = [
    { field: "label", cmdTag: "ChangeLabel", evtTag: "LabelChanged", newValue: "Work" },
    { field: "streetNumber", cmdTag: "ChangeStreetNumber", evtTag: "StreetNumberChanged", newValue: "100" },
    { field: "streetName", cmdTag: "ChangeStreetName", evtTag: "StreetNameChanged", newValue: "Avenue Montaigne" },
    { field: "zipCode", cmdTag: "ChangeZipCode", evtTag: "ZipCodeChanged", newValue: "75008" },
    { field: "city", cmdTag: "ChangeCity", evtTag: "CityChanged", newValue: "Lyon" },
    { field: "country", cmdTag: "ChangeCountry", evtTag: "CountryChanged", newValue: "Belgium" }
  ] as const

  describe.each(fieldTestCases)("$cmdTag", ({ field, cmdTag, evtTag, newValue }) => {
    it(`on state with address → Right([${evtTag}]) with revertToken`, () => {
      const fieldRevertToken = `token-${field}` as RevertToken
      const command = {
        _tag: cmdTag,
        id: addressId,
        revertToken: fieldRevertToken,
        [field]: newValue
      } as AddressCommand

      const result = decide(stateWithAddress(baseAddress), command)

      expect(result).toEqual(Either.right([{
        _tag: evtTag,
        id: addressId,
        revertToken: fieldRevertToken,
        oldValue: baseAddress[field],
        newValue
      }]))
    })

    it(`on empty state → Left(AddressNotFound)`, () => {
      const command = {
        _tag: cmdTag,
        id: addressId,
        revertToken,
        [field]: newValue
      } as AddressCommand

      const result = decide(initialAddressState, command)

      expect(result).toEqual(Either.left({ _tag: "AddressNotFound" }))
    })

    it(`with same value → Right([]) (no-op)`, () => {
      const command = {
        _tag: cmdTag,
        id: addressId,
        revertToken,
        [field]: baseAddress[field] // same as current
      } as AddressCommand

      const result = decide(stateWithAddress(baseAddress), command)

      expect(result).toEqual(Either.right([]))
    })
  })

  // ---------------------------------------------------------------------------
  // DeleteAddress
  // ---------------------------------------------------------------------------
  describe("DeleteAddress", () => {
    it("DeleteAddress on state with address → Right([AddressDeleted]) with snapshot + revertToken", () => {
      const deleteToken = "token-delete" as RevertToken
      const command = {
        _tag: "DeleteAddress" as const,
        id: addressId,
        revertToken: deleteToken
      }

      const result = decide(stateWithAddress(baseAddress), command)

      expect(result).toEqual(Either.right([{
        _tag: "AddressDeleted",
        id: addressId,
        revertToken: deleteToken,
        userId,
        label: baseAddress.label,
        streetNumber: baseAddress.streetNumber,
        streetName: baseAddress.streetName,
        zipCode: baseAddress.zipCode,
        city: baseAddress.city,
        country: baseAddress.country
      }]))
    })

    it("DeleteAddress on empty state → Left(AddressNotFound)", () => {
      const command = {
        _tag: "DeleteAddress" as const,
        id: addressId,
        revertToken
      }

      const result = decide(initialAddressState, command)

      expect(result).toEqual(Either.left({ _tag: "AddressNotFound" }))
    })
  })

  // ---------------------------------------------------------------------------
  // RevertChange
  // ---------------------------------------------------------------------------
  describe("RevertChange", () => {
    // -------------------------------------------------------------------------
    // Field reverts (parametrized)
    // -------------------------------------------------------------------------
    const revertTestCases = [
      { field: "label", evtTag: "LabelReverted", changedValue: "Work", originalValue: "Home" },
      { field: "streetNumber", evtTag: "StreetNumberReverted", changedValue: "100", originalValue: "42" },
      { field: "streetName", evtTag: "StreetNameReverted", changedValue: "Avenue Montaigne", originalValue: "Rue de Rivoli" },
      { field: "zipCode", evtTag: "ZipCodeReverted", changedValue: "75008", originalValue: "75001" },
      { field: "city", evtTag: "CityReverted", changedValue: "Lyon", originalValue: "Paris" },
      { field: "country", evtTag: "CountryReverted", changedValue: "Belgium", originalValue: "France" }
    ] as const

    describe.each(revertTestCases)("reverting $field change", ({ field, evtTag, changedValue, originalValue }) => {
      it(`with valid token → Right([${evtTag}])`, () => {
        const fieldRevertToken = `token-${field}` as RevertToken

        // State: address has changed value, token in pendingReverts
        const changedAddress = { ...baseAddress, [field]: changedValue } as Address
        const pendingReverts = new Map([
          [fieldRevertToken, { _tag: "FieldChange" as const, field, oldValue: originalValue, newValue: changedValue }]
        ])
        const state = stateWithAddressAndReverts(changedAddress, pendingReverts)

        const command = {
          _tag: "RevertChange" as const,
          id: addressId,
          revertToken: fieldRevertToken
        }

        const result = decide(state, command)

        // Should emit *Reverted event with swapped old/new values
        expect(result).toEqual(Either.right([{
          _tag: evtTag,
          id: addressId,
          revertToken: fieldRevertToken,
          oldValue: changedValue,   // What we're reverting FROM
          newValue: originalValue   // What we're reverting TO
        }]))
      })
    })

    it("with invalid token → Left(RevertTokenInvalid)", () => {
      const unknownToken = "token-unknown" as RevertToken
      const command = {
        _tag: "RevertChange" as const,
        id: addressId,
        revertToken: unknownToken
      }

      const result = decide(stateWithAddress(baseAddress), command)

      expect(result).toEqual(Either.left({
        _tag: "RevertTokenInvalid",
        token: unknownToken
      }))
    })

    it("with already-used token → Left(RevertTokenInvalid)", () => {
      // Token was consumed (not in pendingReverts anymore)
      const usedToken = "token-used" as RevertToken
      const command = {
        _tag: "RevertChange" as const,
        id: addressId,
        revertToken: usedToken
      }

      // State has no pending reverts (token was already used)
      const result = decide(stateWithAddress(baseAddress), command)

      expect(result).toEqual(Either.left({
        _tag: "RevertTokenInvalid",
        token: usedToken
      }))
    })

    // -------------------------------------------------------------------------
    // Deletion revert (restore)
    // -------------------------------------------------------------------------
    it("reverting deletion → Right([AddressRestored])", () => {
      const restoreToken = "token-restore" as RevertToken

      // State: address deleted, token in pendingReverts with snapshot
      const pendingReverts = new Map([
        [restoreToken, { _tag: "Deletion" as const, snapshot: baseAddress }]
      ])
      const deletedState: AddressState = {
        address: null,
        pendingReverts
      }

      const command = {
        _tag: "RevertChange" as const,
        id: addressId,
        revertToken: restoreToken
      }

      const result = decide(deletedState, command)

      expect(result).toEqual(Either.right([{
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
      }]))
    })

    // -------------------------------------------------------------------------
    // Creation revert → CreationReverted (correction, terminal)
    // -------------------------------------------------------------------------
    it("reverting creation → Right([CreationReverted])", () => {
      const creationToken = "token-creation" as RevertToken

      // State: address exists, token in pendingReverts as Creation
      const pendingReverts = new Map([
        [creationToken, { _tag: "Creation" as const, snapshot: baseAddress }]
      ])
      const state = stateWithAddressAndReverts(baseAddress, pendingReverts)

      const command = {
        _tag: "RevertChange" as const,
        id: addressId,
        revertToken: creationToken
      }

      const result = decide(state, command)

      // CreationReverted is a CORRECTION — terminal, no new token
      expect(result).toEqual(Either.right([{
        _tag: "CreationReverted",
        id: addressId,
        revertToken: creationToken  // Consumed token (for audit trail)
      }]))
    })
  })
})
