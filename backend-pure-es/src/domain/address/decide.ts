// TYPE ALIAS TRICK: Import namespace with temp alias, then re-expose both type and namespace.
// 1. `import { X as X_ }` — get namespace under temp name
// 2. `type X<A> = X_.X<A>` — clean type alias
// 3. `const X = X_` — re-expose namespace with original name
// Result: `Option<Address>` for types AND `Option.isSome()` for functions.
import { Either as Either_, Match, Option as Option_ } from "effect"

type Either<E, A> = Either_.Either<E, A>
const Either = Either_

type Option<A> = Option_.Option<A>
const Option = Option_

import type { AddressCommand } from "./Commands.js"
import type { AddressEvent } from "./Events.js"
import type { Address } from "./State.js"

// =============================================================================
// Domain Errors
// =============================================================================

export type AddressNotFound = {
  readonly _tag: "AddressNotFound"
}

export type AddressAlreadyDeleted = {
  readonly _tag: "AddressAlreadyDeleted"
}

export type AddressError = AddressNotFound | AddressAlreadyDeleted

// =============================================================================
// decide: (State, Command) → Either<Error, Event[]>
// =============================================================================

export const decide = (
  state: Option<Address>,
  command: AddressCommand
): Either<AddressError, Array<AddressEvent>> =>
  Match.value(command).pipe(
    Match.tag("CreateAddress", (cmd) => {
      // Idempotent: if address already exists, no-op
      if (Option.isSome(state)) {
        return Either.right([])
      }
      return Either.right([{
        _tag: "AddressCreated" as const,
        id: cmd.id,
        userId: cmd.userId,
        label: cmd.label,
        streetNumber: cmd.streetNumber,
        streetName: cmd.streetName,
        zipCode: cmd.zipCode,
        city: cmd.city,
        country: cmd.country
      }])
    }),

    // -------------------------------------------------------------------------
    // Field change commands
    // -------------------------------------------------------------------------
    // Pattern: check state exists, check value changed, emit event
    //
    Match.tag("ChangeLabel", (cmd) =>
      Option.match(state, {
        onNone: () => Either.left({ _tag: "AddressNotFound" as const }),
        onSome: (addr) =>
          addr.label === cmd.label
            ? Either.right([])
            : Either.right([{
                _tag: "LabelChanged" as const,
                id: cmd.id,
                oldValue: addr.label,
                newValue: cmd.label
              }])
      })
    ),

    Match.tag("ChangeStreetNumber", (cmd) =>
      Option.match(state, {
        onNone: () => Either.left({ _tag: "AddressNotFound" as const }),
        onSome: (addr) =>
          addr.streetNumber === cmd.streetNumber
            ? Either.right([])
            : Either.right([{
                _tag: "StreetNumberChanged" as const,
                id: cmd.id,
                oldValue: addr.streetNumber,
                newValue: cmd.streetNumber
              }])
      })
    ),

    Match.tag("ChangeStreetName", (cmd) =>
      Option.match(state, {
        onNone: () => Either.left({ _tag: "AddressNotFound" as const }),
        onSome: (addr) =>
          addr.streetName === cmd.streetName
            ? Either.right([])
            : Either.right([{
                _tag: "StreetNameChanged" as const,
                id: cmd.id,
                oldValue: addr.streetName,
                newValue: cmd.streetName
              }])
      })
    ),

    Match.tag("ChangeZipCode", (cmd) =>
      Option.match(state, {
        onNone: () => Either.left({ _tag: "AddressNotFound" as const }),
        onSome: (addr) =>
          addr.zipCode === cmd.zipCode
            ? Either.right([])
            : Either.right([{
                _tag: "ZipCodeChanged" as const,
                id: cmd.id,
                oldValue: addr.zipCode,
                newValue: cmd.zipCode
              }])
      })
    ),

    Match.tag("ChangeCity", (cmd) =>
      Option.match(state, {
        onNone: () => Either.left({ _tag: "AddressNotFound" as const }),
        onSome: (addr) =>
          addr.city === cmd.city
            ? Either.right([])
            : Either.right([{
                _tag: "CityChanged" as const,
                id: cmd.id,
                oldValue: addr.city,
                newValue: cmd.city
              }])
      })
    ),

    Match.tag("ChangeCountry", (cmd) =>
      Option.match(state, {
        onNone: () => Either.left({ _tag: "AddressNotFound" as const }),
        onSome: (addr) =>
          addr.country === cmd.country
            ? Either.right([])
            : Either.right([{
                _tag: "CountryChanged" as const,
                id: cmd.id,
                oldValue: addr.country,
                newValue: cmd.country
              }])
      })
    ),

    // -------------------------------------------------------------------------
    // Delete command
    // -------------------------------------------------------------------------
    Match.tag("DeleteAddress", (cmd) =>
      Option.match(state, {
        onNone: () => Either.left({ _tag: "AddressNotFound" as const }),
        onSome: (addr) =>
          Either.right([{
            _tag: "AddressDeleted" as const,
            id: cmd.id,
            // Snapshot for restore capability
            userId: addr.userId,
            label: addr.label,
            streetNumber: addr.streetNumber,
            streetName: addr.streetName,
            zipCode: addr.zipCode,
            city: addr.city,
            country: addr.country
          }])
      })
    ),

    Match.exhaustive
  )
