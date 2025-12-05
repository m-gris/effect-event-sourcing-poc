// =============================================================================
// TDD: ConsoleEmailService (and CaptureEmailService for test assertions)
// =============================================================================
//
// We test the email service adapters:
//   1. CaptureEmailService — captures emails for assertions (primary for tests)
//   2. ConsoleEmailService — logs to console (tested indirectly, mainly for dev)
//
// TESTING EFFECT:
// Since send() returns Effect, we use @effect/vitest's `it.effect`.
//
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { EmailService, type EmailContent, Email } from "../../src/EmailService.js"

// Will fail until we create the implementation — that's TDD!
import {
  makeCaptureEmailService,
  makeCaptureEmailServiceLayer
} from "../../src/infrastructure/ConsoleEmailService.js"

// =============================================================================
// Test Fixtures
// =============================================================================

// Valid email address (will need to pass Email schema validation)
const validEmail = "user@example.com"
const validEmailTyped = Email.make(validEmail)

const testEmailContent: EmailContent = {
  to: validEmailTyped,
  subject: "Test Subject",
  body: "Test body content"
}

// =============================================================================
// CaptureEmailService Tests
// =============================================================================

describe("CaptureEmailService", () => {
  describe("makeCaptureEmailService", () => {
    it.effect("send() captures email in getSentEmails()", () =>
      Effect.gen(function* () {
        const capture = makeCaptureEmailService()

        yield* capture.service.send(testEmailContent)

        const sent = capture.getSentEmails()
        expect(sent).toHaveLength(1)
        expect(sent[0]).toEqual(testEmailContent)
      })
    )

    it.effect("multiple sends accumulate in order", () =>
      Effect.gen(function* () {
        const capture = makeCaptureEmailService()
        const email1: EmailContent = { ...testEmailContent, subject: "First" }
        const email2: EmailContent = { ...testEmailContent, subject: "Second" }

        yield* capture.service.send(email1)
        yield* capture.service.send(email2)

        const sent = capture.getSentEmails()
        expect(sent).toHaveLength(2)
        expect(sent[0].subject).toBe("First")
        expect(sent[1].subject).toBe("Second")
      })
    )

    it("clear() resets the captured emails", () => {
      const capture = makeCaptureEmailService()
      // Manually push to simulate sends (sync for this test)
      Effect.runSync(capture.service.send(testEmailContent))

      expect(capture.getSentEmails()).toHaveLength(1)

      capture.clear()

      expect(capture.getSentEmails()).toHaveLength(0)
    })

    it("getSentEmails() returns a copy (immutable)", () => {
      const capture = makeCaptureEmailService()
      Effect.runSync(capture.service.send(testEmailContent))

      const sent1 = capture.getSentEmails()
      const sent2 = capture.getSentEmails()

      // Should be equal but not the same reference
      expect(sent1).toEqual(sent2)
      expect(sent1).not.toBe(sent2)
    })
  })

  describe("makeCaptureEmailServiceLayer", () => {
    it.effect("provides EmailService via Layer", () =>
      Effect.gen(function* () {
        const { layer, getSentEmails } = makeCaptureEmailServiceLayer()

        // Use the service via the Tag (as real code would)
        const program = Effect.gen(function* () {
          const emailService = yield* EmailService
          yield* emailService.send(testEmailContent)
        })

        yield* program.pipe(Effect.provide(layer))

        // Verify capture worked
        expect(getSentEmails()).toHaveLength(1)
        expect(getSentEmails()[0]).toEqual(testEmailContent)
      })
    )
  })
})

// =============================================================================
// Email Validation Tests
// =============================================================================

describe("Email", () => {
  it("accepts valid email addresses", () => {
    expect(() => Email.make("user@example.com")).not.toThrow()
    expect(() => Email.make("test.user@domain.org")).not.toThrow()
    expect(() => Email.make("name+tag@company.co.uk")).not.toThrow()
  })

  it("rejects invalid email addresses", () => {
    expect(() => Email.make("not-an-email")).toThrow()
    expect(() => Email.make("missing@domain")).toThrow()
    expect(() => Email.make("@nodomain.com")).toThrow()
    expect(() => Email.make("spaces in@email.com")).toThrow()
    expect(() => Email.make("")).toThrow()
  })
})
