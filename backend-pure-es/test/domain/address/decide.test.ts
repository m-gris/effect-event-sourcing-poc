// =============================================================================
// TDD: Testing Address `decide`
// =============================================================================
//
// `decide` is where business logic lives: (State, Command) → Either<Error, Event[]>
//
// We test incrementally, one scenario at a time:
//   1. CreateAddress on None → Right([AddressCreated])
//   ... more to come
//
import { describe, expect, it } from "@effect/vitest"
import { Either, Option } from "effect"
import type { AddressCommand, CreateAddress } from "../../../src/domain/address/Commands.js"
import { decide } from "../../../src/domain/address/decide.js"
import type { Address } from "../../../src/domain/address/State.js"

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

// =============================================================================
// decide tests
// =============================================================================

describe("decide", () => {
  // ---------------------------------------------------------------------------
  // CreateAddress
  // ---------------------------------------------------------------------------
  describe("CreateAddress", () => {
    it("CreateAddress on None → Right([AddressCreated])", () => {
      const command: CreateAddress = {
        _tag: "CreateAddress",
        id: addressId,
        userId,
        label: baseAddress.label,
        streetNumber: baseAddress.streetNumber,
        streetName: baseAddress.streetName,
        zipCode: baseAddress.zipCode,
        city: baseAddress.city,
        country: baseAddress.country
      }

      const result = decide(Option.none(), command)

      expect(result).toEqual(Either.right([{
        _tag: "AddressCreated",
        id: addressId,
        userId,
        label: baseAddress.label,
        streetNumber: baseAddress.streetNumber,
        streetName: baseAddress.streetName,
        zipCode: baseAddress.zipCode,
        city: baseAddress.city,
        country: baseAddress.country
      }]))
    })

    it("CreateAddress on Some(Address) → Right([]) (idempotent)", () => {
      const command: CreateAddress = {
        _tag: "CreateAddress",
        id: addressId,
        userId,
        label: baseAddress.label,
        streetNumber: baseAddress.streetNumber,
        streetName: baseAddress.streetName,
        zipCode: baseAddress.zipCode,
        city: baseAddress.city,
        country: baseAddress.country
      }

      const result = decide(Option.some(baseAddress), command)

      expect(result).toEqual(Either.right([]))
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
    it(`on Some(Address) → Right([${evtTag}])`, () => {
      const command = {
        _tag: cmdTag,
        id: addressId,
        [field]: newValue
      } as AddressCommand

      const result = decide(Option.some(baseAddress), command)

      expect(result).toEqual(Either.right([{
        _tag: evtTag,
        id: addressId,
        oldValue: baseAddress[field],
        newValue
      }]))
    })

    it(`on None → Left(AddressNotFound)`, () => {
      const command = {
        _tag: cmdTag,
        id: addressId,
        [field]: newValue
      } as AddressCommand

      const result = decide(Option.none(), command)

      expect(result).toEqual(Either.left({ _tag: "AddressNotFound" }))
    })

    it(`with same value → Right([]) (no-op)`, () => {
      const command = {
        _tag: cmdTag,
        id: addressId,
        [field]: baseAddress[field] // same as current
      } as AddressCommand

      const result = decide(Option.some(baseAddress), command)

      expect(result).toEqual(Either.right([]))
    })
  })

  // ---------------------------------------------------------------------------
  // DeleteAddress
  // ---------------------------------------------------------------------------
  describe("DeleteAddress", () => {
    it("DeleteAddress on Some(Address) → Right([AddressDeleted]) with snapshot", () => {
      const command = {
        _tag: "DeleteAddress" as const,
        id: addressId
      }

      const result = decide(Option.some(baseAddress), command)

      expect(result).toEqual(Either.right([{
        _tag: "AddressDeleted",
        id: addressId,
        userId,
        label: baseAddress.label,
        streetNumber: baseAddress.streetNumber,
        streetName: baseAddress.streetName,
        zipCode: baseAddress.zipCode,
        city: baseAddress.city,
        country: baseAddress.country
      }]))
    })

    it("DeleteAddress on None → Left(AddressNotFound)", () => {
      const command = {
        _tag: "DeleteAddress" as const,
        id: addressId
      }

      const result = decide(Option.none(), command)

      expect(result).toEqual(Either.left({ _tag: "AddressNotFound" }))
    })
  })
})
