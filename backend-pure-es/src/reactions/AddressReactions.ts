// =============================================================================
// Address Reactions — Event-Based Triggers
// =============================================================================
//
// THE CORE INSIGHT OF THIS POC:
// Events ARE the triggers. No TriggerConfig table, no scheduler, no polling.
// The event type is the routing key — pattern match and react.
//
// WHAT THIS FILE DOES:
// Takes an AddressEvent and reacts to it (sends an email).
// Different events → different emails. That's the "event-based trigger".
//
// DESIGN CHOICES:
//   - Inline email content (PoC focus is routing, not templates)
//   - Pattern match on event._tag (explicit, traceable)
//   - User actions → send email
//   - Corrections → no email (terminal events, no spam)
//
// EFFECT PATTERN:
// Returns Effect<void, EmailError, EmailService>
// The caller provides EmailService via Layer; this function just uses it.
//
// SCALA ANALOGY:
// This is like a ZIO service method that depends on EmailService.
// Pattern matching on sealed trait/ADT to route to different behaviors.
//
import { Effect, Match } from "effect"
import type { Email } from "../shared/Email.js"
import { EmailService, type EmailError } from "../EmailService.js"
import type { AddressEvent } from "../domain/address/Events.js"

// =============================================================================
// reactToAddressEvent
// =============================================================================
//
// SIGNATURE:
//   (event: AddressEvent, userEmail: Email) → Effect<void, EmailError, EmailService>
//
// WHY `userEmail` AS PARAMETER?
// The event has `userId` but not the user's email. Rather than looking it up
// (which would add another service dependency), the caller provides it.
// The caller (HTTP handler or use case) already knows the user context.
//
// EXHAUSTIVE MATCHING:
// Match.exhaustive ensures we handle ALL event types. If a new event is added
// to AddressEvent, this function will fail to compile until we handle it.
// This is "make illegal states unrepresentable" at the function level.
//
export const reactToAddressEvent = (
  event: AddressEvent,
  userEmail: Email
): Effect.Effect<void, EmailError, EmailService> =>
  // ===========================================================================
  // EFFECT SYNTAX: Match.value(x).pipe(Match.tag(...), Match.exhaustive)
  // ===========================================================================
  //
  // Effect's pattern matching DSL for discriminated unions.
  //
  // Match.value(event) — start matching on `event`
  // Match.tag("Tag", handler) — handle case where event._tag === "Tag"
  // Match.exhaustive — compile error if any _tag is unhandled
  //
  // SCALA ANALOGY:
  //   event match {
  //     case e: AddressCreated => sendAddressCreatedEmail(e)
  //     case e: CityChanged => sendCityChangedEmail(e)
  //     // ...
  //   }
  //
  // WHY NOT switch/case?
  // Match provides:
  //   1. Exhaustiveness checking (switch doesn't in TS)
  //   2. Type narrowing in each handler
  //   3. Composable — can chain, transform, combine
  //
  Match.value(event).pipe(
    // -------------------------------------------------------------------------
    // USER ACTIONS → Send Email
    // -------------------------------------------------------------------------
    // These are user-initiated changes. Send a safety email with revert link.

    Match.tag("AddressCreated", (e) =>
      sendEmail(
        userEmail,
        "Address Created - Please Confirm",
        `A new address "${e.label}" has been added to your account.

Address details:
- ${e.streetNumber} ${e.streetName}
- ${e.zipCode} ${e.city}
- ${e.country}

If you did not make this change, click to revert:
${makeRevertUrl(e.revertToken)}`
      )
    ),

    Match.tag("LabelChanged", (e) =>
      sendEmail(
        userEmail,
        "Address Label Changed - Please Confirm",
        `Your address label was changed from "${e.oldValue}" to "${e.newValue}".

If you did not make this change, click to revert:
${makeRevertUrl(e.revertToken)}`
      )
    ),

    Match.tag("StreetNumberChanged", (e) =>
      sendEmail(
        userEmail,
        "Street Number Changed - Please Confirm",
        `Your street number was changed from "${e.oldValue}" to "${e.newValue}".

If you did not make this change, click to revert:
${makeRevertUrl(e.revertToken)}`
      )
    ),

    Match.tag("StreetNameChanged", (e) =>
      sendEmail(
        userEmail,
        "Street Name Changed - Please Confirm",
        `Your street name was changed from "${e.oldValue}" to "${e.newValue}".

If you did not make this change, click to revert:
${makeRevertUrl(e.revertToken)}`
      )
    ),

    Match.tag("ZipCodeChanged", (e) =>
      sendEmail(
        userEmail,
        "Zip Code Changed - Please Confirm",
        `Your zip code was changed from "${e.oldValue}" to "${e.newValue}".

If you did not make this change, click to revert:
${makeRevertUrl(e.revertToken)}`
      )
    ),

    Match.tag("CityChanged", (e) =>
      sendEmail(
        userEmail,
        "City Changed - Please Confirm",
        `Your city was changed from "${e.oldValue}" to "${e.newValue}".

If you did not make this change, click to revert:
${makeRevertUrl(e.revertToken)}`
      )
    ),

    Match.tag("CountryChanged", (e) =>
      sendEmail(
        userEmail,
        "Country Changed - Please Confirm",
        `Your country was changed from "${e.oldValue}" to "${e.newValue}".

If you did not make this change, click to revert:
${makeRevertUrl(e.revertToken)}`
      )
    ),

    Match.tag("AddressDeleted", (e) =>
      sendEmail(
        userEmail,
        "Address Deleted - Please Confirm",
        `Your address "${e.label}" has been deleted.

If you did not make this change, click to restore it:
${makeRevertUrl(e.revertToken)}`
      )
    ),

    // -------------------------------------------------------------------------
    // CORRECTIONS → No Email
    // -------------------------------------------------------------------------
    // These are system corrections triggered by revert links.
    // The user already clicked the link — they know what's happening.
    // No need to spam them with another email.
    //
    // Effect.void is Effect's way of saying "do nothing, succeed with void".
    // SCALA ANALOGY: ZIO.unit / IO.unit

    Match.tag("LabelReverted", () => Effect.void),
    Match.tag("StreetNumberReverted", () => Effect.void),
    Match.tag("StreetNameReverted", () => Effect.void),
    Match.tag("ZipCodeReverted", () => Effect.void),
    Match.tag("CityReverted", () => Effect.void),
    Match.tag("CountryReverted", () => Effect.void),
    Match.tag("CreationReverted", () => Effect.void),
    Match.tag("AddressRestored", () => Effect.void),

    // -------------------------------------------------------------------------
    // EXHAUSTIVE CHECK
    // -------------------------------------------------------------------------
    // If we add a new event to AddressEvent and forget to handle it here,
    // this line will cause a compile error. Type safety FTW.
    Match.exhaustive
  )

// =============================================================================
// Revert URL Builder
// =============================================================================
//
// Builds actual clickable URL for the revert link.
// For PoC, hardcoded to localhost:5173 (frontend dev server).
// In production, this would come from config.
//
const FRONTEND_BASE_URL = process.env.FRONTEND_URL || "http://localhost:5173"

const makeRevertUrl = (token: string): string =>
  `${FRONTEND_BASE_URL}/revert/${token}`

// =============================================================================
// sendEmail — Helper to construct and send
// =============================================================================
//
// Wraps EmailService.send with a simpler API for this module.
// Gets EmailService from context, constructs EmailContent, sends.
//
const sendEmail = (
  to: Email,
  subject: string,
  body: string
): Effect.Effect<void, EmailError, EmailService> =>
  Effect.gen(function* () {
    const emailService = yield* EmailService
    yield* emailService.send({ to, subject, body })
  })
