// =============================================================================
// CreateAddress Use Case
// =============================================================================
//
// ORCHESTRATION:
//   1. Lookup user by nickname (get userId + email for reaction)
//   2. Check label uniqueness for this user
//   3. Generate addressId and revertToken
//   4. Execute CreateAddress command via commandHandler
//   5. Project events to Registry
//   6. React to events (SEND EMAIL!)
//   7. Return created address
//
// THIS IS THE FIRST USE CASE THAT TRIGGERS AN EMAIL!
// The core insight of the PoC: events → reactions.
//
import { Effect, Option } from "effect"
import type { UserId } from "../domain/user/State.js"
import type { Address, AddressId, RevertToken } from "../domain/address/State.js"
import { UserEventStore, AddressEventStore, StreamId } from "../EventStore.js"
import { makeCommandHandler } from "../application/CommandHandler.js"
import { decide } from "../domain/address/decide.js"
import { evolve } from "../domain/address/evolve.js"
import { initialAddressState } from "../domain/address/State.js"
// User evolve needed for loadUserEmail helper (read-only)
import { evolve as userEvolve } from "../domain/user/evolve.js"
import { Registry } from "../Registry.js"
import { IdGenerator } from "../IdGenerator.js"
import { EmailService } from "../EmailService.js"
import { reactToAddressEvent } from "../reactions/AddressReactions.js"

// =============================================================================
// Types
// =============================================================================

export interface CreateAddressInput {
  readonly nickname: string
  readonly label: Address["label"]
  readonly streetNumber: Address["streetNumber"]
  readonly streetName: Address["streetName"]
  readonly zipCode: Address["zipCode"]
  readonly city: Address["city"]
  readonly country: Address["country"]
}

export interface CreateAddressOutput {
  readonly id: AddressId
  readonly label: Address["label"]
  readonly streetNumber: Address["streetNumber"]
  readonly streetName: Address["streetName"]
  readonly zipCode: Address["zipCode"]
  readonly city: Address["city"]
  readonly country: Address["country"]
}

// =============================================================================
// Error Types
// =============================================================================
//
// PRECISE ERROR TYPING (same pattern as CreateUser):
//
// The `decide` function for Address returns `AddressError` which is the union
// of ALL possible address errors (AddressNotFound, AddressAlreadyExists, RevertTokenInvalid).
// But CreateAddress can only fail with AddressAlreadyExists.
//
// Additionally, this use case calls `reactToAddressEvent` which can fail with
// `EmailSendError`. We include that in our error type.
//
// We're explicit about what can actually happen:
//   - UserNotFound: user lookup failed (use case level)
//   - LabelAlreadyExists: address with this label exists (use case level)
//   - AddressAlreadyExists: domain rejected (shouldn't happen if label check passed)
//   - EmailSendError: email sending failed (reaction)
//

export type UserNotFound = { readonly _tag: "UserNotFound" }
export type LabelAlreadyExists = { readonly _tag: "LabelAlreadyExists" }

// Import specific domain error (not the full union)
import { type AddressAlreadyExists } from "../domain/address/decide.js"
export { type AddressAlreadyExists }

// Import email error
import { type EmailSendError } from "../EmailService.js"
export { type EmailSendError }

export type CreateAddressError =
  | UserNotFound
  | LabelAlreadyExists
  | AddressAlreadyExists
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

// NOTE: No userCommandHandler here — we only READ user state (for email),
// we don't send commands to the User aggregate in this use case.

// =============================================================================
// Helper: Load user state to get email
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

export const createAddress = (
  input: CreateAddressInput
): Effect.Effect<
  CreateAddressOutput,
  CreateAddressError,
  IdGenerator | UserEventStore | AddressEventStore | Registry | EmailService
> =>
  Effect.gen(function* () {
    const { nickname, label, streetNumber, streetName, zipCode, city, country } = input

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
      // User exists in registry but not in event store — shouldn't happen
      return yield* Effect.fail<UserNotFound>({ _tag: "UserNotFound" })
    }
    const userEmail = maybeEmail.value

    // 3. Check label uniqueness
    const existingAddressId = yield* registry.getAddressIdByLabel(userId, label)
    if (Option.isSome(existingAddressId)) {
      return yield* Effect.fail<LabelAlreadyExists>({ _tag: "LabelAlreadyExists" })
    }

    // 4. Generate addressId and revertToken
    const idGenerator = yield* IdGenerator
    const addressId = (yield* idGenerator.generate()) as AddressId
    const revertToken = (yield* idGenerator.generate()) as RevertToken

    // 5. Execute CreateAddress command
    // NOTE: Narrowing error type — CreateAddress can only fail with AddressAlreadyExists.
    // AddressNotFound and RevertTokenInvalid are impossible for this command.
    const command = {
      _tag: "CreateAddress" as const,
      id: addressId,
      userId,
      revertToken,
      label,
      streetNumber,
      streetName,
      zipCode,
      city,
      country
    }
    const events = yield* addressCommandHandler(StreamId(addressId), command).pipe(
      Effect.catchTag("AddressNotFound", () =>
        Effect.die(new Error("BUG: AddressNotFound should never occur for CreateAddress command"))
      ),
      Effect.catchTag("RevertTokenInvalid", () =>
        Effect.die(new Error("BUG: RevertTokenInvalid should never occur for CreateAddress command"))
      )
    )

    // 6. Project events to Registry
    for (const event of events) {
      yield* registry.projectAddressEvent(event)
    }

    // 7. React to events (SEND EMAIL!)
    for (const event of events) {
      yield* reactToAddressEvent(event, userEmail)
    }

    // 8. Return result
    return {
      id: addressId,
      label,
      streetNumber,
      streetName,
      zipCode,
      city,
      country
    }
  })
