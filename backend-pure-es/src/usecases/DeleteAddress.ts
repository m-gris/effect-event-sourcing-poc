// =============================================================================
// DeleteAddress Use Case
// =============================================================================
//
// ORCHESTRATION:
//   1. Lookup user by nickname
//   2. Lookup address by (userId, label)
//   3. Generate revertToken
//   4. Execute DeleteAddress command
//   5. Project events to Registry
//   6. React to events (send "address deleted" email with restore link)
//   7. Return deletion confirmation
//
import { Effect, Option } from "effect"
import type { UserId } from "../domain/user/State.js"
import type { AddressId, RevertToken } from "../domain/address/State.js"
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

export interface DeleteAddressInput {
  readonly nickname: string
  readonly label: string
}

export interface DeleteAddressOutput {
  readonly deleted: boolean
  readonly label: string
}

// =============================================================================
// Error Types
// =============================================================================

export type UserNotFound = { readonly _tag: "UserNotFound" }
export type AddressNotFound = { readonly _tag: "AddressNotFound" }

import { type EmailSendError } from "../EmailService.js"
export { type EmailSendError }

export type DeleteAddressError =
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
// Use Case Implementation
// =============================================================================

export const deleteAddress = (
  input: DeleteAddressInput
): Effect.Effect<
  DeleteAddressOutput,
  DeleteAddressError,
  IdGenerator | UserEventStore | AddressEventStore | Registry | EmailService
> =>
  Effect.gen(function* () {
    const { nickname, label } = input

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

    // 4. Generate revertToken
    const idGenerator = yield* IdGenerator
    const revertToken = (yield* idGenerator.generate()) as RevertToken

    // 5. Execute DeleteAddress command
    const command = {
      _tag: "DeleteAddress" as const,
      id: addressId,
      revertToken
    }

    const events = yield* addressCommandHandler(StreamId(addressId), command).pipe(
      // Narrow errors: DeleteAddress can only fail with AddressNotFound
      Effect.catchTag("AddressAlreadyExists", () =>
        Effect.die(new Error("BUG: AddressAlreadyExists should never occur for DeleteAddress"))
      ),
      Effect.catchTag("RevertTokenInvalid", () =>
        Effect.die(new Error("BUG: RevertTokenInvalid should never occur for DeleteAddress"))
      )
    )

    // 6. Project events to Registry
    for (const event of events) {
      yield* registry.projectAddressEvent(event)
    }

    // 7. React to events (send email)
    for (const event of events) {
      yield* reactToAddressEvent(event, userEmail)
    }

    // 8. Return result
    return {
      deleted: true,
      label
    }
  })
