// =============================================================================
// TYPE ALIAS TRICK: Import namespace with temp alias, then re-expose both.
// =============================================================================
// 1. `import { Either as E }` — get namespace under temp name
// 2. `type Either<A, Err> = E.Either<A, Err>` — clean type alias
// 3. `const Either = E` — re-expose namespace with original name
// Result: `Either<Events, Error>` for types AND `Either.right()` for functions.
//
// EFFECT vs SCALA: Either type parameter order
//   Effect:  Either<Success, Error>   →  Either<UserEvent[], UserError>
//   Scala:   Either[Error, Success]   →  Either[UserError, List[UserEvent]]
// Effect puts success FIRST to match `Effect<A, E, R>` (success, error, requirements).
//
import { Either as E, Match } from "effect"

import type { AddressCommand } from "./Commands.js"
import type { AddressEvent } from "./Events.js"
import type { AddressFieldName, AddressState, RevertToken } from "./State.js"

type Either<A, Err> = E.Either<A, Err>
const Either = E

// =============================================================================
// Domain Errors
// =============================================================================
//
// DDD PERSPECTIVE:
// Domain errors are part of the ubiquitous language. They describe
// business-level failures, not technical ones.
//
// ERRORS AS VALUES:
// We return Left(error), not throw. The error is data, not an exception.
// Caller can pattern match on it, no try/catch needed.
//

export type AddressNotFound = {
  readonly _tag: "AddressNotFound"
}

export type AddressAlreadyExists = {
  readonly _tag: "AddressAlreadyExists"
}

export type RevertTokenInvalid = {
  readonly _tag: "RevertTokenInvalid"
  readonly token: RevertToken
}

export type AddressError =
  | AddressNotFound
  | AddressAlreadyExists
  | RevertTokenInvalid

// =============================================================================
// decide: (State, Command) → Either<Event[], Error>
// =============================================================================
//
// ES PERSPECTIVE:
// `decide` is the command handler. Given current state and a command,
// it decides what events (if any) should be emitted.
//
// ENRICHED STATE ENABLES PURE REVERT LOGIC:
// The state now includes `pendingReverts: Map<RevertToken, RevertableChange>`.
// This means `decide` can validate revert commands without event history:
//   - Token in map? → Valid, emit appropriate *Reverted event
//   - Token not in map? → Invalid (never issued or already used)
//
// This is the payoff of "make illegal states unrepresentable":
// the state itself encodes what reverts are valid.
//
// EFFECT SYNTAX REMINDER:
//   Either<A, E> — Right for success (A), Left for error (E)
//   Effect puts success type FIRST (opposite of Scala's Either[E, A])
//

export const decide = (
  state: AddressState,
  command: AddressCommand
): Either<Array<AddressEvent>, AddressError> =>
  Match.value(command).pipe(
    // -------------------------------------------------------------------------
    // CreateAddress
    // -------------------------------------------------------------------------
    // Creates a new address. Fails if address already exists.
    //
    // Note: The revertToken is provided by the command — it will be generated
    // by the caller (e.g., service layer) before invoking decide.
    //
    Match.tag("CreateAddress", (cmd) => {
      if (state.address !== null) {
        return Either.left({ _tag: "AddressAlreadyExists" as const })
      }
      return Either.right([{
        _tag: "AddressCreated" as const,
        id: cmd.id,
        revertToken: cmd.revertToken,
        userId: cmd.userId,
        label: cmd.label,
        streetNumber: cmd.streetNumber,
        streetName: cmd.streetName,
        zipCode: cmd.zipCode,
        city: cmd.city,
        country: cmd.country
      }])
    }),
    // -------------------------------------------------------------------------
    // Field change commands
    // -------------------------------------------------------------------------
    // Each updates a single field. Fails if address doesn't exist.
    // No-op if value is unchanged (no event emitted).
    //
    // Note: revertToken is provided by the command.
    //
    Match.tag("ChangeLabel", (cmd) => {
      if (state.address === null) {
        return Either.left({ _tag: "AddressNotFound" as const })
      }
      if (state.address.label === cmd.label) {
        return Either.right([]) // No-op: value unchanged
      }
      return Either.right([{
        _tag: "LabelChanged" as const,
        id: cmd.id,
        revertToken: cmd.revertToken,
        oldValue: state.address.label,
        newValue: cmd.label
      }])
    }),
    Match.tag("ChangeStreetNumber", (cmd) => {
      if (state.address === null) {
        return Either.left({ _tag: "AddressNotFound" as const })
      }
      if (state.address.streetNumber === cmd.streetNumber) {
        return Either.right([])
      }
      return Either.right([{
        _tag: "StreetNumberChanged" as const,
        id: cmd.id,
        revertToken: cmd.revertToken,
        oldValue: state.address.streetNumber,
        newValue: cmd.streetNumber
      }])
    }),
    Match.tag("ChangeStreetName", (cmd) => {
      if (state.address === null) {
        return Either.left({ _tag: "AddressNotFound" as const })
      }
      if (state.address.streetName === cmd.streetName) {
        return Either.right([])
      }
      return Either.right([{
        _tag: "StreetNameChanged" as const,
        id: cmd.id,
        revertToken: cmd.revertToken,
        oldValue: state.address.streetName,
        newValue: cmd.streetName
      }])
    }),
    Match.tag("ChangeZipCode", (cmd) => {
      if (state.address === null) {
        return Either.left({ _tag: "AddressNotFound" as const })
      }
      if (state.address.zipCode === cmd.zipCode) {
        return Either.right([])
      }
      return Either.right([{
        _tag: "ZipCodeChanged" as const,
        id: cmd.id,
        revertToken: cmd.revertToken,
        oldValue: state.address.zipCode,
        newValue: cmd.zipCode
      }])
    }),
    Match.tag("ChangeCity", (cmd) => {
      if (state.address === null) {
        return Either.left({ _tag: "AddressNotFound" as const })
      }
      if (state.address.city === cmd.city) {
        return Either.right([])
      }
      return Either.right([{
        _tag: "CityChanged" as const,
        id: cmd.id,
        revertToken: cmd.revertToken,
        oldValue: state.address.city,
        newValue: cmd.city
      }])
    }),
    Match.tag("ChangeCountry", (cmd) => {
      if (state.address === null) {
        return Either.left({ _tag: "AddressNotFound" as const })
      }
      if (state.address.country === cmd.country) {
        return Either.right([])
      }
      return Either.right([{
        _tag: "CountryChanged" as const,
        id: cmd.id,
        revertToken: cmd.revertToken,
        oldValue: state.address.country,
        newValue: cmd.country
      }])
    }),
    // -------------------------------------------------------------------------
    // DeleteAddress
    // -------------------------------------------------------------------------
    // Deletes the address. Fails if address doesn't exist.
    //
    // Note: revertToken is provided by the command (for the safety email).
    //
    Match.tag("DeleteAddress", (cmd) => {
      if (state.address === null) {
        return Either.left({ _tag: "AddressNotFound" as const })
      }
      return Either.right([{
        _tag: "AddressDeleted" as const,
        id: cmd.id,
        revertToken: cmd.revertToken,
        // Snapshot for restore capability
        userId: state.address.userId,
        label: state.address.label,
        streetNumber: state.address.streetNumber,
        streetName: state.address.streetName,
        zipCode: state.address.zipCode,
        city: state.address.city,
        country: state.address.country
      }])
    }),
    // -------------------------------------------------------------------------
    // RevertChange (the elegant, token-driven revert)
    // -------------------------------------------------------------------------
    // This is where the enriched state pays off.
    //
    // The command only carries the token — not which field, not old/new values.
    // We look up the token in pendingReverts to determine:
    //   1. Is this a valid token? (exists in map)
    //   2. What kind of change does it revert? (FieldChange, Creation, Deletion)
    //   3. What event should we emit?
    //
    // If token not found → error (never issued or already consumed)
    //
    // FP ELEGANCE:
    // The token IS the identifier. No redundant information in the command.
    // No possibility of mismatch (e.g., "RevertCityChange" with wrong token).
    // The state is the source of truth for what each token can undo.
    //
    Match.tag("RevertChange", (cmd) => {
      const pendingRevert = state.pendingReverts.get(cmd.revertToken)

      if (pendingRevert === undefined) {
        return Either.left({
          _tag: "RevertTokenInvalid" as const,
          token: cmd.revertToken
        })
      }

      // Dispatch based on what kind of change this token reverts
      // Using Match.value().pipe() for consistency and exhaustiveness checking
      return Match.value(pendingRevert).pipe(
        Match.tag("FieldChange", (pr) => {
          // Emit the appropriate *Reverted event based on field
          // Note: oldValue/newValue are SWAPPED in the revert event
          //   Original: changed FROM oldValue TO newValue
          //   Revert:   changed FROM newValue TO oldValue (swap them)
          const revertedEvent = makeFieldRevertedEvent(
            pr.field,
            cmd.id,
            cmd.revertToken,
            pr.newValue, // This was the "new" value, now it's "old"
            pr.oldValue // This was the "old" value, now it's "new"
          )
          return Either.right([revertedEvent])
        }),
        Match.tag("Creation", () => {
          // -----------------------------------------------------------------
          // REVERTING A CREATION
          // -----------------------------------------------------------------
          // User clicked revert on a "new address created" safety email.
          // Semantically: "I didn't mean to create this address, undo it."
          //
          // WHY CreationReverted AND NOT AddressDeleted?
          // -----------------------------------------------------------------
          // AddressDeleted is a USER ACTION — it represents "user intentionally
          // deleted their address". User actions are revertable (mistakes happen),
          // so AddressDeleted issues a new revert token.
          //
          // But here we're CORRECTING a mistake, not making a new action.
          // If we emitted AddressDeleted, that deletion would be revertable,
          // leading to: revert → revert the revert → revert that → ...
          //
          // TWO KINDS OF EVENTS (Wlaschin/De Goes pattern):
          //   1. User Actions: AddressCreated, *Changed, AddressDeleted
          //      → Revertable, issue tokens
          //   2. Corrections: *Reverted, CreationReverted, AddressRestored
          //      → Terminal, consume tokens, NO new tokens
          //
          // CreationReverted is a CORRECTION:
          //   - Sets address to null (same effect as deletion)
          //   - Consumes the creation token (removed from pendingReverts)
          //   - Does NOT issue a new token (terminal — can't undo an undo)
          //
          // If user reverts by mistake? They just create the address again.
          // -----------------------------------------------------------------
          //
          return Either.right([{
            _tag: "CreationReverted" as const,
            id: cmd.id,
            revertToken: cmd.revertToken // The consumed token (kept for audit trail)
          }])
        }),
        Match.tag("Deletion", (pr) => {
          // -----------------------------------------------------------------
          // REVERTING A DELETION
          // -----------------------------------------------------------------
          // User clicked revert on an "address deleted" safety email.
          // Semantically: "I didn't mean to delete this, bring it back."
          //
          // AddressRestored is a CORRECTION (like CreationReverted):
          //   - Recreates the address from the snapshot stored in pendingReverts
          //   - Consumes the deletion token (removed from pendingReverts)
          //   - Does NOT issue a new token (terminal — can't undo an undo)
          //
          // If user restores by mistake? They just delete the address again.
          // -----------------------------------------------------------------
          //
          return Either.right([{
            _tag: "AddressRestored" as const,
            id: cmd.id,
            revertToken: cmd.revertToken, // The consumed token (kept for audit trail)
            userId: pr.snapshot.userId,
            label: pr.snapshot.label,
            streetNumber: pr.snapshot.streetNumber,
            streetName: pr.snapshot.streetName,
            zipCode: pr.snapshot.zipCode,
            city: pr.snapshot.city,
            country: pr.snapshot.country
          }])
        }),
        // Compile-time exhaustiveness — if we add a new RevertableChange variant,
        // TypeScript will error here until we handle it
        Match.exhaustive
      )
    }),
    // Compile-time exhaustiveness check
    Match.exhaustive
  )

// -----------------------------------------------------------------------------
// Helper: Create the appropriate *Reverted event based on field name
// -----------------------------------------------------------------------------
// Maps field name to the correct event type with proper typing.
//
// TS LIMITATION: We can't dynamically construct the event type from the field
// name while preserving full type safety. This explicit mapping is the price we pay.
// In a macro-enabled language (Scala 3, Rust), this could be generated.
//
// WHY NOT Match HERE?
// Match.value() works on discriminated unions with `_tag`. But `field` is just
// a string (AddressFieldName), not a tagged union. We use a Record lookup instead,
// which is the idiomatic TS pattern for string → value mappings.
//
// ALTERNATIVE: We could wrap field in { _tag: field } and use Match, but that
// adds ceremony without benefit. The Record approach is cleaner for this case.
//
const fieldToRevertedTag: Record<AddressFieldName, string> = {
  label: "LabelReverted",
  streetNumber: "StreetNumberReverted",
  streetName: "StreetNameReverted",
  zipCode: "ZipCodeReverted",
  city: "CityReverted",
  country: "CountryReverted"
}

const makeFieldRevertedEvent = (
  field: AddressFieldName,
  id: AddressEvent extends { id: infer I } ? I : never,
  revertToken: RevertToken,
  oldValue: string,
  newValue: string
): AddressEvent => {
  const tag = fieldToRevertedTag[field]
  // The `as any` casts are needed because we're constructing the event dynamically.
  // Type safety is ensured by:
  //   1. AddressFieldName is a closed union — only valid fields allowed
  //   2. fieldToRevertedTag maps each field to its correct event tag
  //   3. The event schema definitions are the source of truth
  return {
    _tag: tag,
    id,
    revertToken,
    oldValue: oldValue as any,
    newValue: newValue as any
  } as AddressEvent
}
