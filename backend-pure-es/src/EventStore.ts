// =============================================================================
// EventStore — The Port (Interface)
// =============================================================================
//
// HEXAGONAL ARCHITECTURE:
// This is a PORT — an interface that the application/domain layer depends on.
// Implementations (InMemory, Postgres) are ADAPTERS — they live in infrastructure/.
// The port knows nothing about how events are stored; it only defines WHAT operations exist.
//
// WHY A GENERIC EventStore<E>?
// - De Goes: "Abstract over the effect, not the data" — EventStore is a capability
// - Wlaschin: Single abstraction, parameterized by event type
// - FP principle: Don't duplicate structure; parameterize over differences
//
// Each aggregate (User, Address) will use the same EventStore interface,
// just with different event types (UserEvent, AddressEvent).
//
// EFFECT SERVICE PATTERN:
// In Effect, "interfaces" are modeled as Services using Context.Tag.
// A Service is:
//   1. A Tag (unique identifier for dependency injection)
//   2. A type describing the operations
//   3. Accessed via Effect.flatMap or generators (yield*)
//
// This replaces constructor injection (new Service(dep)) with
// Effect's Context system — dependencies are declared in the Effect type
// and provided via Layers at the edge of the world.
//
// SCALA ANALOGY:
//   - Context.Tag ≈ ZIO's Has[Service] / ZLayer's service identifier
//   - Layer ≈ ZLayer — describes how to build a service from dependencies
//   - Effect<A, E, R> ≈ ZIO[R, E, A] — R is the "environment" (required services)
//
import type { Effect } from "effect"
import { Context } from "effect"

// =============================================================================
// Concrete Tags for Each Aggregate
// =============================================================================
//
// WHY SEPARATE TAGS?
// Effect's Context.Tag requires a concrete type at the Tag level.
// We can't have a single Tag<EventStore<E>> that works for all E.
// So we create one Tag per aggregate type.
//
// This is actually good DDD practice — each aggregate has its own event store
// (conceptually, even if backed by the same database table).
//
// EFFECT SYNTAX: Context.GenericTag<Identifier, ServiceType>
//   - Identifier: string key for the service (for debugging/logging)
//   - ServiceType: the interface this tag provides
//
// Usage:
//   Effect.flatMap(UserEventStore, store => store.load(streamId))
//   // or in generators:
//   const store = yield* UserEventStore
//   const events = yield* store.load(streamId)
//

// Import event types (we'll need these for the concrete tags)
import type { AddressEvent } from "./domain/address/Events.js"
import type { UserEvent } from "./domain/user/Events.js"

// =============================================================================
// Stream ID (Value Object)
// =============================================================================
//
// A StreamId identifies an event stream — typically one per aggregate instance.
// For User aggregate: "user-123" → all events for that user
// For Address aggregate: "address-456" → all events for that address
//
// We brand it to prevent accidentally passing a UserId where a StreamId is expected
// (even though they might have the same underlying value).
//
// DESIGN N.B:
// In some ES systems, StreamId includes the aggregate type prefix ("user-123", "address-456").
// In others, streams are partitioned by type. For this PoC, we keep it simple:
// the caller knows which EventStore<E> they're using, so StreamId is just the ID.
//
export type StreamId = string & { readonly _brand: unique symbol }

// Helper to create StreamId (no validation for PoC — in production, validate non-empty)
export const StreamId = (id: string): StreamId => id as StreamId

// =============================================================================
// EventStore Errors
// =============================================================================
//
// ERRORS AS VALUES (Wlaschin/De Goes):
// Errors are part of the function's type signature, not thrown exceptions.
// The caller must handle them — they can't be ignored.
//
// We define a discriminated union (tagged by _tag) for pattern matching.
//

// StreamNotFound: The requested stream doesn't exist (no events yet)
// NOTE: This might not be an "error" in all cases — a new aggregate has no events.
// Some designs return empty array instead. We'll see what feels right in tests.
export type StreamNotFound = {
  readonly _tag: "StreamNotFound"
  readonly streamId: StreamId
}

// ConcurrencyConflict: Optimistic concurrency check failed
// (Another process appended events since we loaded — our decision was based on stale state)
// For PoC, we might not implement optimistic concurrency, but the error type is ready.
export type ConcurrencyConflict = {
  readonly _tag: "ConcurrencyConflict"
  readonly streamId: StreamId
  readonly expectedVersion: number
  readonly actualVersion: number
}

// EventStoreError: Union of all possible errors
export type EventStoreError = StreamNotFound | ConcurrencyConflict

// =============================================================================
// EventStore Service Definition
// =============================================================================
//
// EFFECT SERVICE PATTERN:
//
// 1. Define an interface (type) describing the operations
// 2. Create a Tag that identifies this service in Effect's Context
// 3. Consumers use Effect.flatMap(Tag, service => ...) or yield* Tag in generators
//
// The generic parameter E is the event type (UserEvent, AddressEvent, etc.).
// Each aggregate gets its own "instance" of EventStore with its event type.
//
// DESIGN DECISION: Generic vs Concrete
// We define EventStore.Service<E> as a generic type, but the Tag must be concrete.
// This means we'll need separate Tags for UserEventStore vs AddressEventStore.
// Alternative: single Tag with event type erased, cast at runtime. We avoid this
// for type safety — Wlaschin would approve.
//

// The service interface — what operations are available
export interface EventStoreService<E> {
  /**
   * Load all events for a stream.
   *
   * Returns: Array of events in order (oldest first)
   *
   * For a new/non-existent stream, returns empty array (not an error).
   * This simplifies aggregate loading — fold over empty array = initial state.
   */
  readonly load: (streamId: StreamId) => Effect.Effect<ReadonlyArray<E>, never>

  /**
   * Append events to a stream.
   *
   * Events are appended atomically — all or nothing.
   * For PoC, no optimistic concurrency (expectedVersion). Can add later.
   *
   * Returns: void on success (events are persisted)
   */
  readonly append: (
    streamId: StreamId,
    events: ReadonlyArray<E>
  ) => Effect.Effect<void, never>
}

// Tag for User aggregate's event store
export class UserEventStore extends Context.Tag("UserEventStore")<
  UserEventStore,
  EventStoreService<UserEvent>
>() {}

// Tag for Address aggregate's event store
export class AddressEventStore extends Context.Tag("AddressEventStore")<
  AddressEventStore,
  EventStoreService<AddressEvent>
>() {}

// =============================================================================
// Summary
// =============================================================================
//
// We now have:
//   - StreamId: branded type for stream identifiers
//   - EventStoreError: discriminated union of possible errors
//   - EventStoreService<E>: generic interface with load/append
//   - UserEventStore: Tag for User aggregate's store
//   - AddressEventStore: Tag for Address aggregate's store
//
// Next: TDD an InMemoryEventStore implementation
//   - Create test file first
//   - Write tests for load/append behavior
//   - Implement to make tests pass
//
