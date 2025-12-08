// =============================================================================
// PostgresRegistry — Adapter Implementation
// =============================================================================
//
// HEXAGONAL ARCHITECTURE:
// This is an ADAPTER — a concrete implementation of the Registry port.
// It persists lookup indexes to PostgreSQL for durability.
//
// TABLES:
//   - nicknames: nickname → user_id
//   - address_labels: (user_id, label) → address_id
//   - revert_tokens: token → address_id
//
// PROJECTION LOGIC:
// Same as InMemoryRegistry — uses Match.exhaustive to handle all event cases.
// Updates SQL tables instead of in-memory Maps.
//
import { Effect, Layer, Match, Option } from "effect"
import { PgClient } from "@effect/sql-pg"

import { Registry, type RegistryService, deriveNickname } from "../Registry.js"
import type { UserId } from "../domain/user/State.js"
import type { AddressId } from "../domain/address/State.js"

// =============================================================================
// Factory: Create PostgresRegistry from PgClient
// =============================================================================

const makePostgresRegistry = Effect.gen(function* () {
  const sql = yield* PgClient.PgClient

  const service: RegistryService = {
    // -------------------------------------------------------------------------
    // Lookups
    // -------------------------------------------------------------------------

    getUserIdByNickname: (nickname) =>
      Effect.gen(function* () {
        const rows = yield* sql<{ user_id: string }>`
          SELECT user_id FROM nicknames WHERE nickname = ${nickname}
        `
        return rows.length > 0 ? Option.some(rows[0].user_id as UserId) : Option.none()
      }).pipe(Effect.orDie),

    getAddressIdByLabel: (userId, label) =>
      Effect.gen(function* () {
        const rows = yield* sql<{ address_id: string }>`
          SELECT address_id FROM address_labels
          WHERE user_id = ${userId} AND label = ${label}
        `
        return rows.length > 0 ? Option.some(rows[0].address_id as AddressId) : Option.none()
      }).pipe(Effect.orDie),

    getAddressIdByToken: (token) =>
      Effect.gen(function* () {
        const rows = yield* sql<{ address_id: string }>`
          SELECT address_id FROM revert_tokens WHERE token = ${token}
        `
        return rows.length > 0 ? Option.some(rows[0].address_id as AddressId) : Option.none()
      }).pipe(Effect.orDie),

    getAddressIdsByUserId: (userId) =>
      Effect.gen(function* () {
        const rows = yield* sql<{ address_id: string }>`
          SELECT address_id FROM address_labels WHERE user_id = ${userId}
        `
        return rows.map((r) => r.address_id as AddressId)
      }).pipe(Effect.orDie),

    // -------------------------------------------------------------------------
    // Projections
    // -------------------------------------------------------------------------

    projectUserEvent: (event) =>
      Match.value(event).pipe(
        Match.tag("UserCreated", (e) =>
          Effect.gen(function* () {
            const nickname = deriveNickname(e.firstName, e.lastName)
            yield* sql`
              INSERT INTO nicknames (nickname, user_id)
              VALUES (${nickname}, ${e.id})
              ON CONFLICT (nickname) DO NOTHING
            `
          }).pipe(Effect.orDie)
        ),
        Match.tag("FirstNameChanged", () => Effect.void),
        Match.tag("LastNameChanged", () => Effect.void),
        Match.exhaustive
      ),

    projectAddressEvent: (event) =>
      Match.value(event).pipe(
        // AddressCreated: insert label + token
        Match.tag("AddressCreated", (e) =>
          Effect.gen(function* () {
            yield* sql`
              INSERT INTO address_labels (user_id, label, address_id)
              VALUES (${e.userId}, ${e.label}, ${e.id})
              ON CONFLICT (user_id, label) DO UPDATE SET address_id = ${e.id}
            `
            yield* sql`
              INSERT INTO revert_tokens (token, address_id)
              VALUES (${e.revertToken}, ${e.id})
              ON CONFLICT (token) DO UPDATE SET address_id = ${e.id}
            `
          }).pipe(Effect.orDie)
        ),

        // Field changes: register new token
        Match.tag("LabelChanged", (e) =>
          Effect.gen(function* () {
            yield* sql`
              INSERT INTO revert_tokens (token, address_id)
              VALUES (${e.revertToken}, ${e.id})
              ON CONFLICT (token) DO UPDATE SET address_id = ${e.id}
            `
            // Update label mapping: need to get userId first
            const [row] = yield* sql<{ user_id: string }>`
              SELECT user_id FROM address_labels WHERE address_id = ${e.id}
            `
            if (row) {
              yield* sql`
                DELETE FROM address_labels WHERE address_id = ${e.id}
              `
              yield* sql`
                INSERT INTO address_labels (user_id, label, address_id)
                VALUES (${row.user_id}, ${e.newValue}, ${e.id})
              `
            }
          }).pipe(Effect.orDie)
        ),

        Match.tag("StreetNumberChanged", (e) =>
          sql`
            INSERT INTO revert_tokens (token, address_id)
            VALUES (${e.revertToken}, ${e.id})
            ON CONFLICT (token) DO UPDATE SET address_id = ${e.id}
          `.pipe(Effect.orDie, Effect.asVoid)
        ),

        Match.tag("StreetNameChanged", (e) =>
          sql`
            INSERT INTO revert_tokens (token, address_id)
            VALUES (${e.revertToken}, ${e.id})
            ON CONFLICT (token) DO UPDATE SET address_id = ${e.id}
          `.pipe(Effect.orDie, Effect.asVoid)
        ),

        Match.tag("ZipCodeChanged", (e) =>
          sql`
            INSERT INTO revert_tokens (token, address_id)
            VALUES (${e.revertToken}, ${e.id})
            ON CONFLICT (token) DO UPDATE SET address_id = ${e.id}
          `.pipe(Effect.orDie, Effect.asVoid)
        ),

        Match.tag("CityChanged", (e) =>
          sql`
            INSERT INTO revert_tokens (token, address_id)
            VALUES (${e.revertToken}, ${e.id})
            ON CONFLICT (token) DO UPDATE SET address_id = ${e.id}
          `.pipe(Effect.orDie, Effect.asVoid)
        ),

        Match.tag("CountryChanged", (e) =>
          sql`
            INSERT INTO revert_tokens (token, address_id)
            VALUES (${e.revertToken}, ${e.id})
            ON CONFLICT (token) DO UPDATE SET address_id = ${e.id}
          `.pipe(Effect.orDie, Effect.asVoid)
        ),

        Match.tag("AddressDeleted", (e) =>
          sql`
            INSERT INTO revert_tokens (token, address_id)
            VALUES (${e.revertToken}, ${e.id})
            ON CONFLICT (token) DO UPDATE SET address_id = ${e.id}
          `.pipe(Effect.orDie, Effect.asVoid)
        ),

        // Corrections: consume token (delete from revert_tokens)
        Match.tag("LabelReverted", (e) =>
          Effect.gen(function* () {
            yield* sql`DELETE FROM revert_tokens WHERE token = ${e.revertToken}`
            // Revert label mapping
            const [row] = yield* sql<{ user_id: string }>`
              SELECT user_id FROM address_labels WHERE address_id = ${e.id}
            `
            if (row) {
              yield* sql`DELETE FROM address_labels WHERE address_id = ${e.id}`
              yield* sql`
                INSERT INTO address_labels (user_id, label, address_id)
                VALUES (${row.user_id}, ${e.newValue}, ${e.id})
              `
            }
          }).pipe(Effect.orDie)
        ),

        Match.tag("StreetNumberReverted", (e) =>
          sql`DELETE FROM revert_tokens WHERE token = ${e.revertToken}`.pipe(
            Effect.orDie,
            Effect.asVoid
          )
        ),

        Match.tag("StreetNameReverted", (e) =>
          sql`DELETE FROM revert_tokens WHERE token = ${e.revertToken}`.pipe(
            Effect.orDie,
            Effect.asVoid
          )
        ),

        Match.tag("ZipCodeReverted", (e) =>
          sql`DELETE FROM revert_tokens WHERE token = ${e.revertToken}`.pipe(
            Effect.orDie,
            Effect.asVoid
          )
        ),

        Match.tag("CityReverted", (e) =>
          sql`DELETE FROM revert_tokens WHERE token = ${e.revertToken}`.pipe(
            Effect.orDie,
            Effect.asVoid
          )
        ),

        Match.tag("CountryReverted", (e) =>
          sql`DELETE FROM revert_tokens WHERE token = ${e.revertToken}`.pipe(
            Effect.orDie,
            Effect.asVoid
          )
        ),

        // CreationReverted: delete label + consume token
        Match.tag("CreationReverted", (e) =>
          Effect.gen(function* () {
            yield* sql`DELETE FROM revert_tokens WHERE token = ${e.revertToken}`
            yield* sql`DELETE FROM address_labels WHERE address_id = ${e.id}`
          }).pipe(Effect.orDie)
        ),

        // AddressRestored: re-register label, consume token
        Match.tag("AddressRestored", (e) =>
          Effect.gen(function* () {
            yield* sql`DELETE FROM revert_tokens WHERE token = ${e.revertToken}`
            yield* sql`
              INSERT INTO address_labels (user_id, label, address_id)
              VALUES (${e.userId}, ${e.label}, ${e.id})
              ON CONFLICT (user_id, label) DO UPDATE SET address_id = ${e.id}
            `
          }).pipe(Effect.orDie)
        ),

        Match.exhaustive
      ),
  }

  return service
})

// =============================================================================
// Layer
// =============================================================================

export const PostgresRegistry = Layer.effect(Registry, makePostgresRegistry)
