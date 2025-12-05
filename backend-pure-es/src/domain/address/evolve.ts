import { Option } from "effect"
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
// PATTERN: Unlike User (which has a single UserNameChanged with field discriminator),
// Address has separate event types per field (LabelChanged, CityChanged, etc.).
// This means more switch cases, but each case is trivially simple.
//
// DELETED STATE:
// When an address is deleted, we return None — the aggregate no longer exists.
// Any subsequent events on this stream would be malformed (handled gracefully as no-op).
// If a revert restores the address (AddressRestored), that will recreate Some(Address).
//

export const evolve = (
  state: OptionType<Address>,
  event: AddressEvent
): OptionType<Address> => {
  switch (event._tag) {
    // -------------------------------------------------------------------------
    // Birth event
    // -------------------------------------------------------------------------
    case "AddressCreated":
      return Option.some({
        id: event.id,
        userId: event.userId,
        label: event.label,
        streetNumber: event.streetNumber,
        streetName: event.streetName,
        zipCode: event.zipCode,
        city: event.city,
        country: event.country
      })

    // -------------------------------------------------------------------------
    // Field change events
    // -------------------------------------------------------------------------
    // Each updates a single field. If state is None, return None (no-op).
    //
    case "LabelChanged":
      return Option.map(state, (addr) => ({ ...addr, label: event.newValue }))

    case "StreetNumberChanged":
      return Option.map(state, (addr) => ({ ...addr, streetNumber: event.newValue }))

    case "StreetNameChanged":
      return Option.map(state, (addr) => ({ ...addr, streetName: event.newValue }))

    case "ZipCodeChanged":
      return Option.map(state, (addr) => ({ ...addr, zipCode: event.newValue }))

    case "CityChanged":
      return Option.map(state, (addr) => ({ ...addr, city: event.newValue }))

    case "CountryChanged":
      return Option.map(state, (addr) => ({ ...addr, country: event.newValue }))

    // -------------------------------------------------------------------------
    // Death event
    // -------------------------------------------------------------------------
    case "AddressDeleted":
      return Option.none()
  }
}
