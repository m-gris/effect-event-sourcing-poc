import { Match, Option } from "effect"
import type { Option as OptionType } from "effect/Option"
import type { AddressEvent } from "./Events.js"
import type { Address } from "./State.js"

// =============================================================================
// evolve: (State, Event) → State
// =============================================================================
//
// ES: Applies an event to the current state, producing the new state.
// For Address, state transitions are:
//   - None + AddressCreated → Some(Address)
//   - Some(Address) + *Changed → Some(Address) with updated field
//   - Some(Address) + AddressDeleted → None
//
// EFFECT MATCH:
// We use Effect's `Match` module instead of plain switch for:
//   1. Exhaustiveness checking — `Match.exhaustive` is a compile error if we miss a case
//   2. More declarative style — closer to Scala's pattern matching
//   3. Type inference — each handler receives the narrowed type automatically
//
// SCALA ANALOGY:
//   Match.value(event).pipe(
//     Match.tag("LabelChanged", e => ...),
//     Match.exhaustive
//   )
// is like:
//   event match {
//     case e: LabelChanged => ...
//   }
//
// The `_tag` field acts as the discriminator (like a sealed trait's subtype).
//

export const evolve = (
  state: OptionType<Address>,
  event: AddressEvent
): OptionType<Address> =>
  Match.value(event).pipe(
    // -------------------------------------------------------------------------
    // Birth event
    // -------------------------------------------------------------------------
    Match.tag("AddressCreated", (e) =>
      Option.some({
        id: e.id,
        userId: e.userId,
        label: e.label,
        streetNumber: e.streetNumber,
        streetName: e.streetName,
        zipCode: e.zipCode,
        city: e.city,
        country: e.country
      })
    ),

    // -------------------------------------------------------------------------
    // Field change events
    // -------------------------------------------------------------------------
    // Each updates a single field. If state is None, map returns None (no-op).
    //
    Match.tag("LabelChanged", (e) =>
      Option.map(state, (addr) => ({ ...addr, label: e.newValue }))
    ),
    Match.tag("StreetNumberChanged", (e) =>
      Option.map(state, (addr) => ({ ...addr, streetNumber: e.newValue }))
    ),
    Match.tag("StreetNameChanged", (e) =>
      Option.map(state, (addr) => ({ ...addr, streetName: e.newValue }))
    ),
    Match.tag("ZipCodeChanged", (e) =>
      Option.map(state, (addr) => ({ ...addr, zipCode: e.newValue }))
    ),
    Match.tag("CityChanged", (e) =>
      Option.map(state, (addr) => ({ ...addr, city: e.newValue }))
    ),
    Match.tag("CountryChanged", (e) =>
      Option.map(state, (addr) => ({ ...addr, country: e.newValue }))
    ),

    // -------------------------------------------------------------------------
    // Death event
    // -------------------------------------------------------------------------
    // When an address is deleted, we return None — the aggregate no longer exists.
    // Any subsequent events on this stream would be malformed (handled gracefully as no-op).
    // If a revert restores the address (AddressRestored), that will recreate Some(Address).
    //
    Match.tag("AddressDeleted", () => Option.none()),

    // Compile-time exhaustiveness check — if we add a new event and forget to
    // handle it here, TypeScript will error on this line.
    Match.exhaustive
  )
