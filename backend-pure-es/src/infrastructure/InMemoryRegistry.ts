// =============================================================================
// InMemoryRegistry — Adapter Implementation
// =============================================================================
//
// HEXAGONAL ARCHITECTURE:
// This is an ADAPTER — a concrete implementation of the Registry port.
// It lives in infrastructure/ because it's about HOW we store/lookup, not WHAT.
//
// IMPLEMENTATION:
// Uses in-memory Maps to store lookup indexes.
// State is managed via Effect's Ref for explicit effectful access.
//
// PRODUCTION NOTE:
// In production, this would be replaced by a PostgresRegistry or similar
// that persists to a database. The interface (RegistryService) stays the same.
//
import { Effect, Layer, Match, Option, Ref } from "effect"
import { Registry, type RegistryService, deriveNickname } from "../Registry.js"
import type { UserId } from "../domain/user/State.js"
import type { AddressId, RevertToken } from "../domain/address/State.js"

// =============================================================================
// Registry State
// =============================================================================

interface RegistryState {
  readonly nicknameToUserId: Map<string, UserId>
  readonly labelToAddressId: Map<string, AddressId> // key = `${userId}:${label}`
  readonly tokenToAddressId: Map<RevertToken, AddressId>
  // Reverse lookup: addressId → (userId, label) — needed for CreationReverted
  readonly addressIdToUserLabel: Map<AddressId, { userId: UserId; label: string }>
  // userId → Set<AddressId> — needed for GetUser to list all addresses
  readonly userIdToAddressIds: Map<UserId, Set<AddressId>>
}

const emptyState = (): RegistryState => ({
  nicknameToUserId: new Map(),
  labelToAddressId: new Map(),
  tokenToAddressId: new Map(),
  addressIdToUserLabel: new Map(),
  userIdToAddressIds: new Map()
})

// =============================================================================
// Helpers
// =============================================================================

// Composite key for (userId, label) lookup
const labelKey = (userId: UserId, label: string): string => `${userId}:${label}`

// =============================================================================
// Factory: Create Registry from Ref
// =============================================================================

const makeInMemoryRegistry = (ref: Ref.Ref<RegistryState>): RegistryService => ({
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

  getAddressIdsByUserId: (userId) =>
    Ref.get(ref).pipe(
      Effect.map((state) => {
        const set = state.userIdToAddressIds.get(userId)
        return set ? Array.from(set) : []
      })
    ),

  // ---------------------------------------------------------------------------
  // Projections
  // ---------------------------------------------------------------------------

  // Project UserEvent — only UserCreated affects the registry
  projectUserEvent: (event) =>
    Match.value(event).pipe(
      Match.tag("UserCreated", (e) =>
        Ref.update(ref, (state) => {
          const nickname = deriveNickname(e.firstName, e.lastName)
          state.nicknameToUserId.set(nickname, e.id)
          return state
        })
      ),
      // Name changes don't affect nickname (it's derived at creation time)
      // In a real system, we might want to update nickname on name change
      // For this PoC, nickname is immutable
      Match.tag("FirstNameChanged", () => Effect.void),
      Match.tag("LastNameChanged", () => Effect.void),
      Match.exhaustive
    ),

  // Project AddressEvent — affects label lookup and token lookup
  projectAddressEvent: (event) =>
    Match.value(event).pipe(
      // AddressCreated: register label → addressId and token → addressId
      Match.tag("AddressCreated", (e) =>
        Ref.update(ref, (state) => {
          state.labelToAddressId.set(labelKey(e.userId, e.label), e.id)
          state.tokenToAddressId.set(e.revertToken, e.id)
          state.addressIdToUserLabel.set(e.id, { userId: e.userId, label: e.label })
          // Add to userId → addressIds lookup
          const existing = state.userIdToAddressIds.get(e.userId) ?? new Set()
          existing.add(e.id)
          state.userIdToAddressIds.set(e.userId, existing)
          return state
        })
      ),

      // Field changes: register new token → addressId
      Match.tag("LabelChanged", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.set(e.revertToken, e.id)
          // Also update the label mapping since label changed
          const meta = state.addressIdToUserLabel.get(e.id)
          if (meta) {
            // Remove old label mapping
            state.labelToAddressId.delete(labelKey(meta.userId, meta.label))
            // Add new label mapping
            state.labelToAddressId.set(labelKey(meta.userId, e.newValue), e.id)
            // Update metadata
            state.addressIdToUserLabel.set(e.id, { userId: meta.userId, label: e.newValue })
          }
          return state
        })
      ),

      Match.tag("StreetNumberChanged", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.set(e.revertToken, e.id)
          return state
        })
      ),

      Match.tag("StreetNameChanged", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.set(e.revertToken, e.id)
          return state
        })
      ),

      Match.tag("ZipCodeChanged", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.set(e.revertToken, e.id)
          return state
        })
      ),

      Match.tag("CityChanged", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.set(e.revertToken, e.id)
          return state
        })
      ),

      Match.tag("CountryChanged", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.set(e.revertToken, e.id)
          return state
        })
      ),

      // AddressDeleted: register token for restore, keep label mapping for now
      Match.tag("AddressDeleted", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.set(e.revertToken, e.id)
          return state
        })
      ),

      // Corrections: consume token (remove from lookup)
      Match.tag("LabelReverted", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.delete(e.revertToken)
          // Revert the label mapping
          const meta = state.addressIdToUserLabel.get(e.id)
          if (meta) {
            state.labelToAddressId.delete(labelKey(meta.userId, meta.label))
            state.labelToAddressId.set(labelKey(meta.userId, e.newValue), e.id)
            state.addressIdToUserLabel.set(e.id, { userId: meta.userId, label: e.newValue })
          }
          return state
        })
      ),

      Match.tag("StreetNumberReverted", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.delete(e.revertToken)
          return state
        })
      ),

      Match.tag("StreetNameReverted", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.delete(e.revertToken)
          return state
        })
      ),

      Match.tag("ZipCodeReverted", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.delete(e.revertToken)
          return state
        })
      ),

      Match.tag("CityReverted", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.delete(e.revertToken)
          return state
        })
      ),

      Match.tag("CountryReverted", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.delete(e.revertToken)
          return state
        })
      ),

      // CreationReverted: remove label → addressId mapping entirely
      Match.tag("CreationReverted", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.delete(e.revertToken)
          const meta = state.addressIdToUserLabel.get(e.id)
          if (meta) {
            state.labelToAddressId.delete(labelKey(meta.userId, meta.label))
            state.addressIdToUserLabel.delete(e.id)
            // Remove from userId → addressIds lookup
            const set = state.userIdToAddressIds.get(meta.userId)
            if (set) {
              set.delete(e.id)
            }
          }
          return state
        })
      ),

      // AddressRestored: re-register label → addressId, consume token
      Match.tag("AddressRestored", (e) =>
        Ref.update(ref, (state) => {
          state.tokenToAddressId.delete(e.revertToken)
          state.labelToAddressId.set(labelKey(e.userId, e.label), e.id)
          state.addressIdToUserLabel.set(e.id, { userId: e.userId, label: e.label })
          // Re-add to userId → addressIds lookup
          const existing = state.userIdToAddressIds.get(e.userId) ?? new Set()
          existing.add(e.id)
          state.userIdToAddressIds.set(e.userId, existing)
          return state
        })
      ),

      Match.exhaustive
    )
})

// =============================================================================
// Layer: Provides Registry service
// =============================================================================

export const makeInMemoryRegistryLayer = (): Layer.Layer<Registry> =>
  Layer.effect(
    Registry,
    Effect.gen(function* () {
      const ref = yield* Ref.make(emptyState())
      return makeInMemoryRegistry(ref)
    })
  )

// Convenience export for production use
export const InMemoryRegistry = makeInMemoryRegistryLayer()
