// =============================================================================
// Registry — The Port (Interface)
// =============================================================================
//
// HEXAGONAL ARCHITECTURE:
// This is a PORT — an interface for the event-sourced read model (projection).
// Implementations (InMemoryRegistry) are ADAPTERS — they live in infrastructure/.
// The port knows nothing about HOW lookups work; it only defines WHAT operations exist.
//
// PURPOSE:
// A PROJECTION — a read model derived from events.
// Subscribes to domain events and builds lookup indexes.
//
// LOOKUPS:
//   - nickname → userId       (from UserCreated events)
//   - (userId, label) → addressId  (from AddressCreated events)
//   - revertToken → addressId      (from events with revertToken)
//   - userId → [addressIds]        (from AddressCreated events)
//
// EFFECT SERVICE PATTERN:
//   1. Define an interface describing operations
//   2. Create a Tag for dependency injection
//   3. Consumers use `yield* Registry` in Effect generators
//
import { Context, Effect, Option } from "effect"
import type { UserId, FirstName, LastName } from "./domain/user/State.js"
import type { UserEvent } from "./domain/user/Events.js"
import type { AddressEvent } from "./domain/address/Events.js"
import type { AddressId, RevertToken } from "./domain/address/State.js"

// =============================================================================
// Registry Service Interface
// =============================================================================

export interface RegistryService {
  // Lookups — return Option (absence is not an error)
  readonly getUserIdByNickname: (nickname: string) => Effect.Effect<Option.Option<UserId>>
  readonly getAddressIdByLabel: (userId: UserId, label: string) => Effect.Effect<Option.Option<AddressId>>
  readonly getAddressIdByToken: (token: RevertToken) => Effect.Effect<Option.Option<AddressId>>
  // List all address IDs for a user — needed for GetUser use case
  readonly getAddressIdsByUserId: (userId: UserId) => Effect.Effect<ReadonlyArray<AddressId>>

  // Projections — update state from events
  readonly projectUserEvent: (event: UserEvent) => Effect.Effect<void>
  readonly projectAddressEvent: (event: AddressEvent) => Effect.Effect<void>
}

// =============================================================================
// Registry Tag
// =============================================================================

export class Registry extends Context.Tag("Registry")<Registry, RegistryService>() {}

// =============================================================================
// Helper: Derive nickname from name
// =============================================================================
//
// Exported for use cases that need to generate nicknames.
// "Jean" + "Dupont" → "jean-dupont"
// "Jean Pierre" + "De La Fontaine" → "jean-pierre-de-la-fontaine"
//

export const deriveNickname = (firstName: FirstName, lastName: LastName): string =>
  `${firstName}-${lastName}`.toLowerCase().replace(/\s+/g, "-")
