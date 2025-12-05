// =============================================================================
// UpdateAddressField Use Case
// =============================================================================
//
// ORCHESTRATION:
//   1. Lookup user by nickname (get userId + email for reaction)
//   2. Lookup address by (userId, label)
//   3. Generate revertToken
//   4. Execute the appropriate Change* command
//   5. Project events to Registry
//   6. React to events (SEND FIELD-SPECIFIC EMAIL!)
//   7. Return updated field info
//
// THIS IS THE "DIFFERENT EMAILS PER FIELD" USE CASE!
// The boss's challenge: "different messages based on which field changed."
//
import { Effect, Option } from "effect"
import type { UserId } from "../domain/user/State.js"
import type { AddressId, RevertToken, AddressFieldName } from "../domain/address/State.js"
import { UserEventStore, AddressEventStore, StreamId } from "../EventStore.js"
import { makeCommandHandler } from "../application/CommandHandler.js"
import { decide } from "../domain/address/decide.js"
import { evolve } from "../domain/address/evolve.js"
import { initialAddressState } from "../domain/address/State.js"
import { evolve as userEvolve } from "../domain/user/evolve.js"
import { Registry } from "../Registry.js"
import { IdGenerator } from "../IdGenerator.js"
import { EmailService } from "../EmailService.js"
import { reactToAddressEvent } from "../reactions/AddressReactions.js"

// =============================================================================
// Types
// =============================================================================

export interface UpdateAddressFieldInput {
  readonly nickname: string
  readonly label: string
  readonly field: AddressFieldName
  readonly value: string
}

export interface UpdateAddressFieldOutput {
  readonly field: AddressFieldName
  readonly oldValue: string
  readonly newValue: string
}

// =============================================================================
// Error Types
// =============================================================================

export type UserNotFound = { readonly _tag: "UserNotFound" }
export type AddressNotFound = { readonly _tag: "AddressNotFound" }

import { type EmailSendError } from "../EmailService.js"
export { type EmailSendError }

export type UpdateAddressFieldError =
  | UserNotFound
  | AddressNotFound
  | EmailSendError

// =============================================================================
// Command Handler
// =============================================================================

const addressCommandHandler = makeCommandHandler({
  tag: AddressEventStore,
  initialState: initialAddressState,
  evolve,
  decide
})

// =============================================================================
// Helper: Load user email
// =============================================================================

const loadUserEmail = (userId: UserId) =>
  Effect.gen(function* () {
    const userStore = yield* UserEventStore
    const events = yield* userStore.load(StreamId(userId))
    const state = events.reduce(userEvolve, Option.none())
    return Option.map(state, (user) => user.email)
  })

// =============================================================================
// Helper: Load current address state to get old value
// =============================================================================

const loadAddressState = (addressId: AddressId) =>
  Effect.gen(function* () {
    const addressStore = yield* AddressEventStore
    const events = yield* addressStore.load(StreamId(addressId))
    return events.reduce(evolve, initialAddressState)
  })

// =============================================================================
// Helper: Build the correct Change* command based on field
// =============================================================================
//
// Maps field name to command _tag. The command structure is uniform:
//   { _tag, id, revertToken, [field]: value }
//
const fieldToCommandTag: Record<AddressFieldName, string> = {
  label: "ChangeLabel",
  streetNumber: "ChangeStreetNumber",
  streetName: "ChangeStreetName",
  zipCode: "ChangeZipCode",
  city: "ChangeCity",
  country: "ChangeCountry"
}

const makeChangeCommand = (
  field: AddressFieldName,
  addressId: AddressId,
  revertToken: RevertToken,
  value: string
) => ({
  _tag: fieldToCommandTag[field],
  id: addressId,
  revertToken,
  [field]: value
})

// =============================================================================
// Use Case Implementation
// =============================================================================

export const updateAddressField = (
  input: UpdateAddressFieldInput
): Effect.Effect<
  UpdateAddressFieldOutput,
  UpdateAddressFieldError,
  IdGenerator | UserEventStore | AddressEventStore | Registry | EmailService
> =>
  Effect.gen(function* () {
    const { nickname, label, field, value } = input

    // 1. Lookup user by nickname
    const registry = yield* Registry
    const maybeUserId = yield* registry.getUserIdByNickname(nickname)

    if (Option.isNone(maybeUserId)) {
      return yield* Effect.fail<UserNotFound>({ _tag: "UserNotFound" })
    }
    const userId = maybeUserId.value

    // 2. Get user email for reaction
    const maybeEmail = yield* loadUserEmail(userId)
    if (Option.isNone(maybeEmail)) {
      return yield* Effect.fail<UserNotFound>({ _tag: "UserNotFound" })
    }
    const userEmail = maybeEmail.value

    // 3. Lookup address by (userId, label)
    const maybeAddressId = yield* registry.getAddressIdByLabel(userId, label)
    if (Option.isNone(maybeAddressId)) {
      return yield* Effect.fail<AddressNotFound>({ _tag: "AddressNotFound" })
    }
    const addressId = maybeAddressId.value

    // 4. Load current address state to get old value
    const addressState = yield* loadAddressState(addressId)
    if (addressState.address === null) {
      return yield* Effect.fail<AddressNotFound>({ _tag: "AddressNotFound" })
    }
    const oldValue = addressState.address[field] as string

    // 5. Generate revertToken
    const idGenerator = yield* IdGenerator
    const revertToken = (yield* idGenerator.generate()) as RevertToken

    // 6. Execute the Change* command
    const command = makeChangeCommand(field, addressId, revertToken, value)
    const events = yield* addressCommandHandler(StreamId(addressId), command as any).pipe(
      // Narrow errors: Change* can only fail with AddressNotFound
      Effect.catchTag("AddressAlreadyExists", () =>
        Effect.die(new Error("BUG: AddressAlreadyExists should never occur for Change* command"))
      ),
      Effect.catchTag("RevertTokenInvalid", () =>
        Effect.die(new Error("BUG: RevertTokenInvalid should never occur for Change* command"))
      )
    )

    // 7. Project events to Registry
    for (const event of events) {
      yield* registry.projectAddressEvent(event)
    }

    // 8. React to events (SEND FIELD-SPECIFIC EMAIL!)
    for (const event of events) {
      yield* reactToAddressEvent(event, userEmail)
    }

    // 9. Return result
    // Note: if value === oldValue, no event was emitted (no-op), we still return
    return {
      field,
      oldValue,
      newValue: value
    }
  })
