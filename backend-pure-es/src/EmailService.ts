// =============================================================================
// EmailService — The Port (Interface)
// =============================================================================
//
// HEXAGONAL ARCHITECTURE:
// This is a PORT — an interface that the application/reaction layer depends on.
// Implementations (Console, Ethereal) are ADAPTERS — they live in infrastructure/.
// The port knows nothing about HOW emails are sent; it only defines WHAT operations exist.
//
// WHY A SIMPLE INTERFACE?
// For this PoC, we only need one operation: send an email.
// No templates, no attachments, no scheduling — just send(to, subject, body).
// Keeping it minimal makes the concept clear.
//
// EFFECT SERVICE PATTERN:
// Same pattern as EventStore:
//   1. Define an interface describing operations
//   2. Create a Tag for dependency injection
//   3. Consumers use `yield* EmailService` in Effect generators
//
import { Context, Effect } from "effect"

// Re-export Email from shared for convenience
// Consumers can import { Email } from "./EmailService.js" or from "./shared/Email.js"
export { Email } from "./shared/Email.js"
import type { Email } from "./shared/Email.js"

// Email content — what we need to send an email
export interface EmailContent {
  readonly to: Email
  readonly subject: string
  readonly body: string
}

// =============================================================================
// EmailService Errors
// =============================================================================
//
// ERRORS AS VALUES:
// What can go wrong when sending email?
// For PoC, we keep it simple: either it works or it doesn't.
//

export type EmailSendError = {
  readonly _tag: "EmailSendError"
  readonly message: string
  readonly cause?: unknown
}

export type EmailError = EmailSendError

// =============================================================================
// EmailService Interface
// =============================================================================
//
// The service interface — what operations are available.
//
// For PoC: just `send`. Returns void on success, fails with EmailError.
//
// WHY Effect<void, EmailError> AND NOT Either?
// Sending email is inherently effectful (I/O). Unlike `decide` (pure),
// this operation interacts with the outside world. Effect captures this.
//

export interface EmailServiceInterface {
  /**
   * Send an email.
   *
   * Returns: void on success
   * Fails: EmailSendError if something goes wrong
   */
  readonly send: (email: EmailContent) => Effect.Effect<void, EmailError>
}

// =============================================================================
// EmailService Tag
// =============================================================================
//
// The Context.Tag for dependency injection.
// Consumers: `const emailService = yield* EmailService`
//

export class EmailService extends Context.Tag("EmailService")<
  EmailService,
  EmailServiceInterface
>() {}

// =============================================================================
// Summary
// =============================================================================
//
// We now have:
//   - EmailContent: simple struct (to, subject, body)
//   - EmailError: discriminated union of possible errors
//   - EmailServiceInterface: send(email) → Effect<void, EmailError>
//   - EmailService: Tag for DI
//
// Next: TDD the ConsoleEmailService adapter (logs to console instead of sending)
//
