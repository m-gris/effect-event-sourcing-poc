// =============================================================================
// CreateUser Use Case
// =============================================================================
//
// ORCHESTRATION:
// Use cases are the "workflow" layer — they orchestrate domain operations
// and infrastructure without containing business logic.
//
// FLOW:
//   1. Check if nickname already exists (uniqueness constraint)
//   2. Generate userId
//   3. Execute CreateUser command via commandHandler
//   4. Project UserCreated event to Registry
//   5. Return user with derived nickname
//
// NO EMAIL TRIGGERED — user creation is just setup.
//
// DEPENDENCIES (in Effect's R parameter):
//   - IdGenerator: for generating userId
//   - UserEventStore: for persisting events
//   - Registry: for projecting events and checking uniqueness
//
import { Effect, Option } from "effect"
import type { UserId, FirstName, LastName } from "../domain/user/State.js"
import type { Email } from "../shared/Email.js"
import { UserEventStore } from "../EventStore.js"
import { makeCommandHandler } from "../application/CommandHandler.js"
import { decide } from "../domain/user/decide.js"
import { evolve } from "../domain/user/evolve.js"
import { Registry, deriveNickname } from "../Registry.js"
import { IdGenerator } from "../IdGenerator.js"
import { StreamId } from "../EventStore.js"

// =============================================================================
// Types
// =============================================================================

export interface CreateUserInput {
  readonly email: Email
  readonly firstName: FirstName
  readonly lastName: LastName
}

export interface CreateUserOutput {
  readonly id: UserId
  readonly email: Email
  readonly firstName: FirstName
  readonly lastName: LastName
  readonly nickname: string
}

// Error types — re-export from domain + use case level
import { type UserError } from "../domain/user/decide.js"
export { type UserError }

// Use case adds its own check before calling domain
export type NicknameAlreadyExists = { readonly _tag: "NicknameAlreadyExists" }

export type CreateUserError = UserError | NicknameAlreadyExists

// =============================================================================
// User Command Handler
// =============================================================================

const userCommandHandler = makeCommandHandler({
  tag: UserEventStore,
  initialState: Option.none(),
  evolve,
  decide
})

// =============================================================================
// Use Case Implementation
// =============================================================================

export const createUser = (
  input: CreateUserInput
): Effect.Effect<
  CreateUserOutput,
  CreateUserError,
  IdGenerator | UserEventStore | Registry
> =>
  Effect.gen(function* () {
    const { email, firstName, lastName } = input

    // 1. Derive nickname and check uniqueness
    const nickname = deriveNickname(firstName, lastName)
    const registry = yield* Registry
    const existingUserId = yield* registry.getUserIdByNickname(nickname)

    if (Option.isSome(existingUserId)) {
      return yield* Effect.fail<NicknameAlreadyExists>({ _tag: "NicknameAlreadyExists" })
    }

    // 2. Generate userId
    const idGenerator = yield* IdGenerator
    const userId = (yield* idGenerator.generate()) as UserId

    // 3. Execute CreateUser command
    const command = {
      _tag: "CreateUser" as const,
      id: userId,
      email,
      firstName,
      lastName
    }
    const events = yield* userCommandHandler(StreamId(userId), command)

    // 4. Project events to Registry
    for (const event of events) {
      yield* registry.projectUserEvent(event)
    }

    // 5. Return result
    return {
      id: userId,
      email,
      firstName,
      lastName,
      nickname
    }
  })
