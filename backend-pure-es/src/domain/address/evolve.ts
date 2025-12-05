import { Match } from "effect"
import type { AddressEvent } from "./Events.js"
import type { Address, AddressState, RevertableChange, RevertToken } from "./State.js"

// =============================================================================
// evolve: (State, Event) → State
// =============================================================================
//
// ES PERSPECTIVE:
// Applies an event to the current state, producing the new state.
// This is a left fold — events are applied in order, each producing a new state.
//
// ENRICHED STATE:
// Unlike the simpler Option<Address> approach, we now track:
//   - address: The current address data (or null if not created/deleted)
//   - pendingReverts: Map<RevertToken, RevertableChange>
//
// The pendingReverts map enables `decide` to validate revert commands
// without needing access to the full event history.
//
// STATE TRANSITIONS:
//   - AddressCreated: address=null → address=Address, add token to pendingReverts
//   - *Changed: update field, add token to pendingReverts
//   - AddressDeleted: address=Address → address=null, add token to pendingReverts
//   - *Reverted: update field, REMOVE token from pendingReverts
//   - AddressRestored: address=null → address=Address, REMOVE token from pendingReverts
//
// KEY INSIGHT:
// Token issuance (*Changed, AddressCreated, AddressDeleted) ADDS to pendingReverts.
// Token consumption (*Reverted, AddressRestored) REMOVES from pendingReverts.
// This is the "make illegal states unrepresentable" principle in action.
//

// -----------------------------------------------------------------------------
// Helper: Add a pending revert
// -----------------------------------------------------------------------------
const addPendingRevert = (
  pendingReverts: ReadonlyMap<RevertToken, RevertableChange>,
  token: RevertToken,
  change: RevertableChange
): ReadonlyMap<RevertToken, RevertableChange> => {
  const newMap = new Map(pendingReverts)
  newMap.set(token, change)
  return newMap
}

// -----------------------------------------------------------------------------
// Helper: Remove a pending revert (token consumed)
// -----------------------------------------------------------------------------
const removePendingRevert = (
  pendingReverts: ReadonlyMap<RevertToken, RevertableChange>,
  token: RevertToken
): ReadonlyMap<RevertToken, RevertableChange> => {
  const newMap = new Map(pendingReverts)
  newMap.delete(token)
  return newMap
}

// -----------------------------------------------------------------------------
// Helper: Map field event tag to field name (currently unused but kept for reference)
// -----------------------------------------------------------------------------
// These mappings could be useful for dynamic event handling. Currently, we
// handle each event explicitly in the Match for full type safety.
//
// const changedTagToField: Record<string, AddressFieldName> = {
//   LabelChanged: "label",
//   StreetNumberChanged: "streetNumber",
//   StreetNameChanged: "streetName",
//   ZipCodeChanged: "zipCode",
//   CityChanged: "city",
//   CountryChanged: "country"
// }
//
// const revertedTagToField: Record<string, AddressFieldName> = {
//   LabelReverted: "label",
//   StreetNumberReverted: "streetNumber",
//   StreetNameReverted: "streetName",
//   ZipCodeReverted: "zipCode",
//   CityReverted: "city",
//   CountryReverted: "country"
// }

// =============================================================================
// evolve function
// =============================================================================

export const evolve = (
  state: AddressState,
  event: AddressEvent
): AddressState =>
  Match.value(event).pipe(
    // -------------------------------------------------------------------------
    // Birth event
    // -------------------------------------------------------------------------
    // Creates the address and registers the creation as a pending revert.
    //
    Match.tag("AddressCreated", (e) => {
      const address: Address = {
        id: e.id,
        userId: e.userId,
        label: e.label,
        streetNumber: e.streetNumber,
        streetName: e.streetName,
        zipCode: e.zipCode,
        city: e.city,
        country: e.country
      }
      return {
        address,
        pendingReverts: addPendingRevert(
          state.pendingReverts,
          e.revertToken,
          { _tag: "Creation", snapshot: address }
        )
      }
    }),
    // -------------------------------------------------------------------------
    // Field change events
    // -------------------------------------------------------------------------
    // Updates the field and registers the change as a pending revert.
    //
    // TYPE NOTE: We use `as Address` because TS can't verify the spread
    // produces a valid Address (the field key is dynamic). The Match.tag
    // ensures we're in the correct branch, so this is safe.
    //
    Match.tag("LabelChanged", (e) => ({
      address: state.address ? { ...state.address, label: e.newValue } : null,
      pendingReverts: addPendingRevert(
        state.pendingReverts,
        e.revertToken,
        { _tag: "FieldChange", field: "label", oldValue: e.oldValue, newValue: e.newValue }
      )
    })),
    Match.tag("StreetNumberChanged", (e) => ({
      address: state.address ? { ...state.address, streetNumber: e.newValue } : null,
      pendingReverts: addPendingRevert(
        state.pendingReverts,
        e.revertToken,
        { _tag: "FieldChange", field: "streetNumber", oldValue: e.oldValue, newValue: e.newValue }
      )
    })),
    Match.tag("StreetNameChanged", (e) => ({
      address: state.address ? { ...state.address, streetName: e.newValue } : null,
      pendingReverts: addPendingRevert(
        state.pendingReverts,
        e.revertToken,
        { _tag: "FieldChange", field: "streetName", oldValue: e.oldValue, newValue: e.newValue }
      )
    })),
    Match.tag("ZipCodeChanged", (e) => ({
      address: state.address ? { ...state.address, zipCode: e.newValue } : null,
      pendingReverts: addPendingRevert(
        state.pendingReverts,
        e.revertToken,
        { _tag: "FieldChange", field: "zipCode", oldValue: e.oldValue, newValue: e.newValue }
      )
    })),
    Match.tag("CityChanged", (e) => ({
      address: state.address ? { ...state.address, city: e.newValue } : null,
      pendingReverts: addPendingRevert(
        state.pendingReverts,
        e.revertToken,
        { _tag: "FieldChange", field: "city", oldValue: e.oldValue, newValue: e.newValue }
      )
    })),
    Match.tag("CountryChanged", (e) => ({
      address: state.address ? { ...state.address, country: e.newValue } : null,
      pendingReverts: addPendingRevert(
        state.pendingReverts,
        e.revertToken,
        { _tag: "FieldChange", field: "country", oldValue: e.oldValue, newValue: e.newValue }
      )
    })),
    // -------------------------------------------------------------------------
    // Death event
    // -------------------------------------------------------------------------
    // Marks the address as deleted and registers deletion as a pending revert.
    // The snapshot is stored in the event (and in pendingReverts) for restoration.
    //
    Match.tag("AddressDeleted", (e) => ({
      address: null,
      pendingReverts: addPendingRevert(
        state.pendingReverts,
        e.revertToken,
        {
          _tag: "Deletion",
          snapshot: {
            id: e.id,
            userId: e.userId,
            label: e.label,
            streetNumber: e.streetNumber,
            streetName: e.streetName,
            zipCode: e.zipCode,
            city: e.city,
            country: e.country
          }
        }
      )
    })),
    // -------------------------------------------------------------------------
    // Field revert events
    // -------------------------------------------------------------------------
    // Updates the field (back to original value) and REMOVES the token from
    // pendingReverts — the revert has been consumed, can't be used again.
    //
    Match.tag("LabelReverted", (e) => ({
      address: state.address ? { ...state.address, label: e.newValue } : null,
      pendingReverts: removePendingRevert(state.pendingReverts, e.revertToken)
    })),
    Match.tag("StreetNumberReverted", (e) => ({
      address: state.address ? { ...state.address, streetNumber: e.newValue } : null,
      pendingReverts: removePendingRevert(state.pendingReverts, e.revertToken)
    })),
    Match.tag("StreetNameReverted", (e) => ({
      address: state.address ? { ...state.address, streetName: e.newValue } : null,
      pendingReverts: removePendingRevert(state.pendingReverts, e.revertToken)
    })),
    Match.tag("ZipCodeReverted", (e) => ({
      address: state.address ? { ...state.address, zipCode: e.newValue } : null,
      pendingReverts: removePendingRevert(state.pendingReverts, e.revertToken)
    })),
    Match.tag("CityReverted", (e) => ({
      address: state.address ? { ...state.address, city: e.newValue } : null,
      pendingReverts: removePendingRevert(state.pendingReverts, e.revertToken)
    })),
    Match.tag("CountryReverted", (e) => ({
      address: state.address ? { ...state.address, country: e.newValue } : null,
      pendingReverts: removePendingRevert(state.pendingReverts, e.revertToken)
    })),
    // -------------------------------------------------------------------------
    // CreationReverted (correction — terminal)
    // -------------------------------------------------------------------------
    // User reverted an address creation → address is "un-created" (set to null).
    // This is a CORRECTION, not a user action:
    //   - Removes the creation token from pendingReverts (consumed)
    //   - Does NOT add a new token (terminal — can't undo an undo)
    //
    Match.tag("CreationReverted", (e) => ({
      address: null,
      pendingReverts: removePendingRevert(state.pendingReverts, e.revertToken)
    })),
    // -------------------------------------------------------------------------
    // AddressRestored (correction — terminal)
    // -------------------------------------------------------------------------
    // User reverted an address deletion → address is recreated from snapshot.
    // This is a CORRECTION, not a user action:
    //   - Removes the deletion token from pendingReverts (consumed)
    //   - Does NOT add a new token (terminal — can't undo an undo)
    //
    Match.tag("AddressRestored", (e) => ({
      address: {
        id: e.id,
        userId: e.userId,
        label: e.label,
        streetNumber: e.streetNumber,
        streetName: e.streetName,
        zipCode: e.zipCode,
        city: e.city,
        country: e.country
      },
      pendingReverts: removePendingRevert(state.pendingReverts, e.revertToken)
    })),
    // Compile-time exhaustiveness check
    Match.exhaustive
  )
