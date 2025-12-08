// =============================================================================
// GetUser Use Case
// =============================================================================
//
// ORCHESTRATION:
//   1. Lookup userId by nickname
//   2. Load user events → fold → get user state
//   3. Get address IDs for this user
//   4. For each addressId: load events → fold → get address state
//   5. Return user + addresses
//
// READ-ONLY: No commands, no events emitted, no emails.
//
// WHY FOLD EVENTS?
// This is pure event sourcing: state is derived from events on read.
// No separate "user table" — we replay history to get current state.
//
import { Effect, Option } from "effect"
import type { UserId, FirstName, LastName } from "../domain/user/State.js"
import type { Email } from "../shared/Email.js"
import type { AddressId, Label, StreetNumber, StreetName, ZipCode, City, Country } from "../domain/address/State.js"
import { UserEventStore, AddressEventStore, StreamId } from "../EventStore.js"
import { evolve as userEvolve } from "../domain/user/evolve.js"
import { evolve as addressEvolve } from "../domain/address/evolve.js"
import { initialAddressState } from "../domain/address/State.js"
import { Registry } from "../Registry.js"

// =============================================================================
// Types
// =============================================================================

export interface GetUserInput {
  readonly nickname: string
}

export interface UserOutput {
  readonly id: UserId
  readonly email: Email
  readonly firstName: FirstName
  readonly lastName: LastName
}

export interface AddressOutput {
  readonly id: AddressId
  readonly label: Label
  readonly streetNumber: StreetNumber
  readonly streetName: StreetName
  readonly zipCode: ZipCode
  readonly city: City
  readonly country: Country
}

export interface GetUserOutput {
  readonly user: UserOutput
  readonly addresses: ReadonlyArray<AddressOutput>
}

// =============================================================================
// Error Types
// =============================================================================

export type UserNotFound = { readonly _tag: "UserNotFound" }

export type GetUserError = UserNotFound

// =============================================================================
// Use Case Implementation
// =============================================================================

export const getUser = (
  input: GetUserInput
): Effect.Effect<
  GetUserOutput,
  GetUserError,
  UserEventStore | AddressEventStore | Registry
> =>
  Effect.gen(function* () {
    const { nickname } = input

    // 1. Lookup userId by nickname
    const registry = yield* Registry
    const maybeUserId = yield* registry.getUserIdByNickname(nickname)

    if (Option.isNone(maybeUserId)) {
      return yield* Effect.fail<UserNotFound>({ _tag: "UserNotFound" })
    }
    const userId = maybeUserId.value

    // 2. Load user events and fold to get current state
    const userStore = yield* UserEventStore
    const userEvents = yield* userStore.load(StreamId(userId))
    const userState = userEvents.reduce(userEvolve, Option.none())

    if (Option.isNone(userState)) {
      // Shouldn't happen if Registry is consistent, but handle gracefully
      return yield* Effect.fail<UserNotFound>({ _tag: "UserNotFound" })
    }
    const user = userState.value

    // 3. Get all address IDs for this user
    const addressIds = yield* registry.getAddressIdsByUserId(userId)

    // 4. For each addressId, load events and fold to get current state
    const addressStore = yield* AddressEventStore
    const addresses: AddressOutput[] = []

    for (const addressId of addressIds) {
      const addressEvents = yield* addressStore.load(StreamId(addressId))
      const addressState = addressEvents.reduce(addressEvolve, initialAddressState)

      // Only include if address exists (not deleted/reverted)
      if (addressState.address !== null) {
        addresses.push({
          id: addressId,
          label: addressState.address.label,
          streetNumber: addressState.address.streetNumber,
          streetName: addressState.address.streetName,
          zipCode: addressState.address.zipCode,
          city: addressState.address.city,
          country: addressState.address.country
        })
      }
    }

    // 5. Return user + addresses
    return {
      user: {
        id: userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      addresses
    }
  })
