// =============================================================================
// ConsoleEmailService — Adapter Implementation
// =============================================================================
//
// HEXAGONAL ARCHITECTURE:
// This is an ADAPTER — a concrete implementation of the EmailService port.
// It lives in infrastructure/ because it's about HOW we send, not WHAT we send.
//
// PURPOSE:
// For development and testing. Instead of sending real emails, it:
//   1. Logs to console (for dev visibility)
//   2. Captures sent emails in an array (for test assertions)
//
// This lets us:
//   - Run tests without SMTP server
//   - See emails in dev console
//   - Assert on email content in tests
//
// EFFECT LAYER PATTERN:
// We export:
//   1. `makeConsoleEmailService()` — factory that creates a service instance
//   2. `ConsoleEmailService` — Layer for DI
//   3. `makeCaptureEmailService()` — test variant that captures emails for assertions
//
import { Effect, Layer } from "effect"
import {
  EmailService,
  type EmailContent,
  type EmailServiceInterface
} from "../EmailService.js"

// =============================================================================
// Console Adapter (logs to console)
// =============================================================================
//
// Simply logs the email details to console. Good for dev.
//

export const makeConsoleEmailService = (): EmailServiceInterface => ({
  send: (email: EmailContent) =>
    Effect.sync(() => {
      console.log("═══════════════════════════════════════════════════════════")
      console.log("📧 EMAIL SENT (Console Adapter)")
      console.log("═══════════════════════════════════════════════════════════")
      console.log(`To:      ${email.to}`)
      console.log(`Subject: ${email.subject}`)
      console.log("───────────────────────────────────────────────────────────")
      console.log(email.body)
      console.log("═══════════════════════════════════════════════════════════")
    })
})

// Layer for DI
export const ConsoleEmailService = Layer.succeed(
  EmailService,
  makeConsoleEmailService()
)

// =============================================================================
// Capture Adapter (for tests)
// =============================================================================
//
// Captures sent emails in an array for test assertions.
//
// USAGE IN TESTS:
//   const capture = makeCaptureEmailService()
//   // ... run code that sends emails ...
//   const sent = capture.getSentEmails()
//   expect(sent).toHaveLength(1)
//   expect(sent[0].subject).toBe("Address Created")
//

export interface CaptureEmailService {
  readonly service: EmailServiceInterface
  readonly getSentEmails: () => ReadonlyArray<EmailContent>
  readonly clear: () => void
}

// TS/FP PATTERN: Closure-based encapsulation
// The factory function creates a closure over `sent`.
// Each call to makeCaptureEmailService() gets its own private array.
// This is how we get "instance state" in functional style — no classes needed.
//
// SCALA ANALOGY: Like a function returning a trait implementation
// where the trait's methods close over local vals from the outer function.
//
export const makeCaptureEmailService = (): CaptureEmailService => {
  // Mutable array to capture emails (fine for tests)
  // Private to this instance via closure — not exposed directly
  const sent: EmailContent[] = []

  const service: EmailServiceInterface = {
    send: (email: EmailContent) =>
      Effect.sync(() => {
        sent.push(email)
      })
  }

  return {
    service,
    getSentEmails: () => [...sent], // Return copy to prevent external mutation
    clear: () => {
      sent.length = 0 // TS trick: setting length to 0 clears array in-place
    }
  }
}

// Helper to create a Layer from a capture service
// Useful when you want to provide via Layer but also access the capture
export const makeCaptureEmailServiceLayer = (): {
  layer: Layer.Layer<EmailService>
  getSentEmails: () => ReadonlyArray<EmailContent>
  clear: () => void
} => {
  const capture = makeCaptureEmailService()
  return {
    layer: Layer.succeed(EmailService, capture.service),
    getSentEmails: capture.getSentEmails,
    clear: capture.clear
  }
}
