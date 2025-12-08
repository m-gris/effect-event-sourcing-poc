// =============================================================================
// RevertChange Use Case
// =============================================================================
//
// ORCHESTRATION:
//   1. Lookup address by revert token
//   2. Execute RevertChange command
//   3. Project events to Registry
//   4. Return confirmation
//
// THIS IS THE CLIMAX OF THE POC!
// User clicks revert link → change is undone → NO spam email loop.
// The "correction" events (e.g., CityReverted) don't trigger emails.
//
import { Effect, Option } from "effect"
import type { RevertToken } from "../domain/address/State.js"
import { AddressEventStore, UserEventStore, StreamId } from "../EventStore.js"
import { makeCommandHandler } from "../application/CommandHandler.js"
import { decide } from "../domain/address/decide.js"
import { evolve } from "../domain/address/evolve.js"
import { evolve as userEvolve } from "../domain/user/evolve.js"
import { initialAddressState } from "../domain/address/State.js"
import { Registry, deriveNickname } from "../Registry.js"

// =============================================================================
// NOTE: No EmailService, No reactToAddressEvent
// =============================================================================
//
// WHY?
// Corrections (revert events) are SILENT by design. They:
//   - Consume the revert token (one-time use)
//   - Do NOT issue a new token (terminal — can't undo an undo)
//   - Do NOT trigger emails (no spam loop)
//
// Calling reactToAddressEvent would just return Effect.void anyway.
// Better to not call it at all — makes the intent explicit in the code.
//

// =============================================================================
// Types
// =============================================================================

export interface RevertChangeInput {
  readonly token: RevertToken
}

export interface RevertChangeOutput {
  readonly reverted: boolean
  readonly message: string
  readonly nickname: string // For redirect back to user profile
}

// =============================================================================
// Error Types
// =============================================================================

export type TokenNotFound = { readonly _tag: "TokenNotFound" }

import { type RevertTokenInvalid } from "../domain/address/decide.js"
export { type RevertTokenInvalid }

export type RevertChangeError = TokenNotFound | RevertTokenInvalid

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
// Use Case Implementation
// =============================================================================

export const revertChange = (
  input: RevertChangeInput
): Effect.Effect<
  RevertChangeOutput,
  RevertChangeError,
  AddressEventStore | UserEventStore | Registry
> =>
  Effect.gen(function* () {
    const { token } = input

    // 1. Lookup address by token
    const registry = yield* Registry
    const maybeAddressId = yield* registry.getAddressIdByToken(token)

    if (Option.isNone(maybeAddressId)) {
      return yield* Effect.fail<TokenNotFound>({ _tag: "TokenNotFound" })
    }
    const addressId = maybeAddressId.value

    // 2. Execute RevertChange command
    const command = {
      _tag: "RevertChange" as const,
      id: addressId,
      revertToken: token
    }
    const events = yield* addressCommandHandler(StreamId(addressId), command).pipe(
      // Narrow errors: RevertChange can only fail with RevertTokenInvalid
      Effect.catchTag("AddressNotFound", () =>
        Effect.die(new Error("BUG: AddressNotFound should never occur for RevertChange command"))
      ),
      Effect.catchTag("AddressAlreadyExists", () =>
        Effect.die(new Error("BUG: AddressAlreadyExists should never occur for RevertChange command"))
      )
    )

    // 3. Project events to Registry
    //    (consumes the token — subsequent lookups will return None)
    for (const event of events) {
      yield* registry.projectAddressEvent(event)
    }

    // 4. Get nickname for redirect
    //    Load address events to find the AddressCreated event (has userId)
    const addressStore = yield* AddressEventStore
    const addressEvents = yield* addressStore.load(StreamId(addressId))

    // The userId is on the AddressCreated event
    const createdEvent = addressEvents.find(e => e._tag === "AddressCreated")
    if (!createdEvent || createdEvent._tag !== "AddressCreated") {
      return yield* Effect.die(new Error("BUG: No AddressCreated event found"))
    }
    const userId = createdEvent.userId

    const userStore = yield* UserEventStore
    const userEvents = yield* userStore.load(StreamId(userId))
    const userState = userEvents.reduce(userEvolve, Option.none())

    if (Option.isNone(userState)) {
      return yield* Effect.die(new Error("BUG: User not found for address"))
    }
    const user = userState.value
    const nickname = deriveNickname(user.firstName, user.lastName)

    // 5. Return confirmation with nickname for redirect
    //    NOTE: No reactToAddressEvent call — corrections are SILENT (no email)
    return {
      reverted: true,
      message: "Change successfully reverted",
      nickname
    }
  })
