// =============================================================================
// Registry — In-Memory Lookup Indexes
// =============================================================================
//
// PURPOSE:
// A "poor man's read model" — maps human-readable identifiers to aggregate IDs.
// Updated after each successful command. Not event-sourced, just cached indexes.
//
// THREE LOOKUPS:
//   - nickname → userId       (for /users/:nickname routes)
//   - (userId, label) → addressId  (for /users/:nickname/addresses/:label)
//   - revertToken → addressId      (for /revert/:token)
//
// EFFECT PATTERN:
// Uses Ref<RegistryState> for explicit mutable state.
// - Lookups return Effect<Option<Id>, never> — absence is Option, not error
// - Mutations return Effect<void, never> — always succeed
//
// WHY Ref?
// Ref makes state access explicit as Effects. The lookup logic is pure;
// the state access is effectful. De Goes approved.
//
// SCALA ANALOGY:
// Ref ≈ ZIO's Ref — a mutable reference with effectful read/write.
//
import { Context, Effect, Layer, Option, Ref } from "effect"
import type { UserId } from "./domain/user/State.js"
import type { AddressId, RevertToken } from "./domain/address/State.js"

// =============================================================================
// Registry State
// =============================================================================

interface RegistryState {
  readonly nicknameToUserId: Map<string, UserId>
  readonly labelToAddressId: Map<string, AddressId> // key = `${userId}:${label}`
  readonly tokenToAddressId: Map<RevertToken, AddressId>
}

const emptyState = (): RegistryState => ({
  nicknameToUserId: new Map(),
  labelToAddressId: new Map(),
  tokenToAddressId: new Map()
})

// Helper: composite key for (userId, label) lookup
const labelKey = (userId: UserId, label: string): string => `${userId}:${label}`

// =============================================================================
// Registry Service Interface
// =============================================================================

export interface RegistryService {
  // Lookups — return Option (absence is not an error)
  readonly getUserIdByNickname: (nickname: string) => Effect.Effect<Option.Option<UserId>>
  readonly getAddressIdByLabel: (userId: UserId, label: string) => Effect.Effect<Option.Option<AddressId>>
  readonly getAddressIdByToken: (token: RevertToken) => Effect.Effect<Option.Option<AddressId>>

  // Mutations — always succeed
  readonly registerUser: (nickname: string, userId: UserId) => Effect.Effect<void>
  readonly registerAddress: (userId: UserId, label: string, addressId: AddressId) => Effect.Effect<void>
  readonly registerToken: (token: RevertToken, addressId: AddressId) => Effect.Effect<void>
  readonly unregisterToken: (token: RevertToken) => Effect.Effect<void>
}

// =============================================================================
// Registry Tag
// =============================================================================

export class Registry extends Context.Tag("Registry")<Registry, RegistryService>() {}

// =============================================================================
// Factory: Create Registry from Ref
// =============================================================================
//
// Takes a Ref<RegistryState> and returns the service implementation.
// The Ref is created by the Layer; this factory just wires up the operations.
//
const makeRegistry = (ref: Ref.Ref<RegistryState>): RegistryService => ({
  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------
  getUserIdByNickname: (nickname) =>
    Ref.get(ref).pipe(
      Effect.map((state) => Option.fromNullable(state.nicknameToUserId.get(nickname)))
    ),

  getAddressIdByLabel: (userId, label) =>
    Ref.get(ref).pipe(
      Effect.map((state) => Option.fromNullable(state.labelToAddressId.get(labelKey(userId, label))))
    ),

  getAddressIdByToken: (token) =>
    Ref.get(ref).pipe(
      Effect.map((state) => Option.fromNullable(state.tokenToAddressId.get(token)))
    ),

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  registerUser: (nickname, userId) =>
    Ref.update(ref, (state) => {
      state.nicknameToUserId.set(nickname, userId)
      return state
    }),

  registerAddress: (userId, label, addressId) =>
    Ref.update(ref, (state) => {
      state.labelToAddressId.set(labelKey(userId, label), addressId)
      return state
    }),

  registerToken: (token, addressId) =>
    Ref.update(ref, (state) => {
      state.tokenToAddressId.set(token, addressId)
      return state
    }),

  unregisterToken: (token) =>
    Ref.update(ref, (state) => {
      state.tokenToAddressId.delete(token)
      return state
    })
})

// =============================================================================
// Layer: Provides Registry service
// =============================================================================
//
// Creates a fresh Ref<RegistryState> and wires up the Registry service.
// Use makeRegistryLayer() for tests (fresh state each time).
//
export const makeRegistryLayer = (): Layer.Layer<Registry> =>
  Layer.effect(
    Registry,
    Effect.gen(function* () {
      const ref = yield* Ref.make(emptyState())
      return makeRegistry(ref)
    })
  )

// Singleton layer for production (one registry for the app lifetime)
export const RegistryLive = makeRegistryLayer()
