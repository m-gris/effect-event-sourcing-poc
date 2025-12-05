// =============================================================================
// TDD: Address Reactions
// =============================================================================
//
// REACTIONS LAYER:
// When events happen, we react to them — in this case, by sending emails.
// This is the "event-based trigger" the PoC demonstrates.
//
// THE CORE INSIGHT:
// Events ARE the triggers. No TriggerConfig table, no scheduler, no polling.
// The event type is the routing key — pattern match and react.
//
// WHAT WE TEST:
//   1. User actions (AddressCreated, *Changed, AddressDeleted) → send email
//   2. Corrections (*Reverted, AddressRestored, CreationReverted) → NO email
//
// WHY NO EMAIL FOR CORRECTIONS?
// Corrections are terminal — they undo a previous action. If we sent an email
// for the original action, we don't spam again when it's reverted. The user
// already clicked the revert link; they know what happened.
//
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Email } from "../../src/shared/Email.js"
import { EmailService } from "../../src/EmailService.js"
import { makeCaptureEmailService } from "../../src/infrastructure/ConsoleEmailService.js"
import type { AddressEvent } from "../../src/domain/address/Events.js"
import type { Address, RevertToken } from "../../src/domain/address/State.js"

// Will fail until we implement — that's TDD!
import { reactToAddressEvent } from "../../src/reactions/AddressReactions.js"

// =============================================================================
// Test Fixtures
// =============================================================================

const userEmail = Email.make("user@example.com")
const addressId = "addr-123" as Address["id"]
const userId = "user-456" as Address["userId"]
const revertToken = "token-abc" as RevertToken

// Base address data for events
const baseAddressData = {
  id: addressId,
  userId,
  label: "Home" as Address["label"],
  streetNumber: "42" as Address["streetNumber"],
  streetName: "Rue de Rivoli" as Address["streetName"],
  zipCode: "75001" as Address["zipCode"],
  city: "Paris" as Address["city"],
  country: "France" as Address["country"]
}

// =============================================================================
// Tests: User Actions → Send Email
// =============================================================================

describe("reactToAddressEvent", () => {
  describe("user actions → send email", () => {
    it.effect("AddressCreated → sends email", () =>
      Effect.gen(function* () {
        const event: AddressEvent = {
          _tag: "AddressCreated",
          revertToken,
          ...baseAddressData
        }
        const capture = makeCaptureEmailService()

        yield* reactToAddressEvent(event, userEmail).pipe(
          Effect.provideService(EmailService, capture.service)
        )

        const sent = capture.getSentEmails()
        expect(sent).toHaveLength(1)
        expect(sent[0].to).toBe(userEmail)
        expect(sent[0].subject).toContain("Address")
      })
    )

    it.effect("CityChanged → sends email mentioning city", () =>
      Effect.gen(function* () {
        const event: AddressEvent = {
          _tag: "CityChanged",
          id: addressId,
          revertToken,
          oldValue: "Paris" as Address["city"],
          newValue: "Lyon" as Address["city"]
        }
        const capture = makeCaptureEmailService()

        yield* reactToAddressEvent(event, userEmail).pipe(
          Effect.provideService(EmailService, capture.service)
        )

        const sent = capture.getSentEmails()
        expect(sent).toHaveLength(1)
        expect(sent[0].to).toBe(userEmail)
        // Subject or body should mention the field changed
        const content = sent[0].subject + sent[0].body
        expect(content.toLowerCase()).toContain("city")
      })
    )

    it.effect("CountryChanged → sends email mentioning country", () =>
      Effect.gen(function* () {
        const event: AddressEvent = {
          _tag: "CountryChanged",
          id: addressId,
          revertToken,
          oldValue: "France" as Address["country"],
          newValue: "Belgium" as Address["country"]
        }
        const capture = makeCaptureEmailService()

        yield* reactToAddressEvent(event, userEmail).pipe(
          Effect.provideService(EmailService, capture.service)
        )

        const sent = capture.getSentEmails()
        expect(sent).toHaveLength(1)
        expect(sent[0].to).toBe(userEmail)
        const content = sent[0].subject + sent[0].body
        expect(content.toLowerCase()).toContain("country")
      })
    )

    it.effect("AddressDeleted → sends email", () =>
      Effect.gen(function* () {
        const event: AddressEvent = {
          _tag: "AddressDeleted",
          revertToken,
          ...baseAddressData
        }
        const capture = makeCaptureEmailService()

        yield* reactToAddressEvent(event, userEmail).pipe(
          Effect.provideService(EmailService, capture.service)
        )

        const sent = capture.getSentEmails()
        expect(sent).toHaveLength(1)
        expect(sent[0].to).toBe(userEmail)
        expect(sent[0].subject.toLowerCase()).toContain("deleted")
      })
    )
  })

  // ===========================================================================
  // Tests: Corrections → NO Email
  // ===========================================================================

  describe("corrections → no email", () => {
    it.effect("CityReverted → no email sent", () =>
      Effect.gen(function* () {
        const event: AddressEvent = {
          _tag: "CityReverted",
          id: addressId,
          revertToken,
          oldValue: "Lyon" as Address["city"],
          newValue: "Paris" as Address["city"]
        }
        const capture = makeCaptureEmailService()

        yield* reactToAddressEvent(event, userEmail).pipe(
          Effect.provideService(EmailService, capture.service)
        )

        expect(capture.getSentEmails()).toHaveLength(0)
      })
    )

    it.effect("CreationReverted → no email sent", () =>
      Effect.gen(function* () {
        const event: AddressEvent = {
          _tag: "CreationReverted",
          id: addressId,
          revertToken
        }
        const capture = makeCaptureEmailService()

        yield* reactToAddressEvent(event, userEmail).pipe(
          Effect.provideService(EmailService, capture.service)
        )

        expect(capture.getSentEmails()).toHaveLength(0)
      })
    )

    it.effect("AddressRestored → no email sent", () =>
      Effect.gen(function* () {
        const event: AddressEvent = {
          _tag: "AddressRestored",
          revertToken,
          ...baseAddressData
        }
        const capture = makeCaptureEmailService()

        yield* reactToAddressEvent(event, userEmail).pipe(
          Effect.provideService(EmailService, capture.service)
        )

        expect(capture.getSentEmails()).toHaveLength(0)
      })
    )
  })
})
