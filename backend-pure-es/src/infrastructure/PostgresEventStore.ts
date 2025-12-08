// =============================================================================
// PostgresEventStore — Adapter Implementation
// =============================================================================
//
// HEXAGONAL ARCHITECTURE:
// This is an ADAPTER — a concrete implementation of the EventStore port.
// It persists events to PostgreSQL for durability.
//
// EFFECT SQL PATTERN:
// Uses @effect/sql-pg for type-safe, effectful database access.
// PgClient is injected via Layer — no global connection pool.
//
// SCHEMA:
// Single `events` table with:
//   - stream_id: aggregate identifier
//   - stream_type: 'user' or 'address' (for querying by type)
//   - version: monotonically increasing per stream
//   - event_type: the event's _tag (e.g., 'UserCreated')
//   - payload: full event as JSONB
//
import { Effect, Layer } from "effect"
import { PgClient } from "@effect/sql-pg"

import type { AddressEvent } from "../domain/address/Events.js"
import type { UserEvent } from "../domain/user/Events.js"
import {
  AddressEventStore,
  type EventStoreService,
  type StreamId,
  UserEventStore,
} from "../EventStore.js"

// =============================================================================
// Factory: Create a Postgres EventStore for a specific event type
// =============================================================================

const makePostgresEventStore = <E extends { _tag: string }>(
  streamType: "user" | "address"
): Effect.Effect<EventStoreService<E>, never, PgClient.PgClient> =>
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient

    return {
      // -----------------------------------------------------------------------
      // load: StreamId → Effect<E[], never>
      // -----------------------------------------------------------------------
      load: (streamId: StreamId) =>
        Effect.gen(function* () {
          const rows = yield* sql<{ payload: E }>`
            SELECT payload
            FROM events
            WHERE stream_id = ${streamId}
              AND stream_type = ${streamType}
            ORDER BY version ASC
          `
          return rows.map((row) => row.payload)
        }).pipe(
          // Convert any SQL errors to defects (bug in our code, not expected)
          Effect.orDie
        ),

      // -----------------------------------------------------------------------
      // append: (StreamId, E[]) → Effect<void, never>
      // -----------------------------------------------------------------------
      append: (streamId: StreamId, events: ReadonlyArray<E>) =>
        Effect.gen(function* () {
          if (events.length === 0) {
            return // No-op for empty append
          }

          // Get current max version for this stream
          const [maxVersionRow] = yield* sql<{ max_version: number | null }>`
            SELECT MAX(version) as max_version
            FROM events
            WHERE stream_id = ${streamId}
          `
          const currentVersion = maxVersionRow?.max_version ?? 0

          // Batch insert all events in a single query
          const values = events.map((event, i) => ({
            stream_id: streamId,
            stream_type: streamType,
            version: currentVersion + i + 1,
            event_type: event._tag,
            payload: event,
          }))

          yield* sql`
            INSERT INTO events ${sql.insert(values)}
          `
        }).pipe(
          // Convert any SQL errors to defects
          Effect.orDie
        ),
    }
  })

// =============================================================================
// Layers: For Effect Dependency Injection
// =============================================================================

// Layer for UserEventStore backed by Postgres
export const PostgresUserEventStore = Layer.effect(
  UserEventStore,
  makePostgresEventStore<UserEvent>("user")
)

// Layer for AddressEventStore backed by Postgres
export const PostgresAddressEventStore = Layer.effect(
  AddressEventStore,
  makePostgresEventStore<AddressEvent>("address")
)

// Combined layer for both stores
export const PostgresEventStores = Layer.merge(
  PostgresUserEventStore,
  PostgresAddressEventStore
)

// =============================================================================
// Helper: Create layers with a specific PgClient
// =============================================================================
//
// For tests or custom configurations, you can create layers
// with a specific PgClient layer provided.
//
export const makePostgresEventStoreLayers = (pgClientLayer: Layer.Layer<PgClient.PgClient>) =>
  Layer.provideMerge(PostgresEventStores, pgClientLayer)
