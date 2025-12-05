// =============================================================================
// EtherealEmailService — Adapter for Ethereal (fake SMTP)
// =============================================================================
//
// WHAT IS ETHEREAL?
// Ethereal is a fake SMTP service by Nodemailer. It:
//   - Accepts real SMTP connections
//   - Captures emails in a web inbox (doesn't deliver to real recipients)
//   - Great for demos: "look, here's the actual email in a real inbox"
//
// HOW IT WORKS:
// 1. On startup, we create a test account (generates temporary credentials)
// 2. Each email is sent via real SMTP protocol
// 3. We log the URL where you can view the email
//
// DEMO VALUE:
// Instead of "trust me, see terminal", you can open a link and show the
// rendered email with the revert link. Proves it would work in production.
//
import { Effect, Layer } from "effect"
import * as nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"
import {
  EmailService,
  type EmailContent,
  type EmailError,
  type EmailServiceInterface
} from "../EmailService.js"

// =============================================================================
// Ethereal Adapter
// =============================================================================

interface EtherealConfig {
  readonly transporter: Transporter
  readonly testAccount: nodemailer.TestAccount
}

const createEtherealConfig = (): Effect.Effect<EtherealConfig, EmailError> =>
  Effect.tryPromise({
    try: async () => {
      // Create a test account on Ethereal
      const testAccount = await nodemailer.createTestAccount()

      // Create transporter with test account credentials
      const transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      })

      console.log("═══════════════════════════════════════════════════════════")
      console.log("📬 ETHEREAL EMAIL CONFIGURED")
      console.log("═══════════════════════════════════════════════════════════")
      console.log(`   User: ${testAccount.user}`)
      console.log(`   Pass: ${testAccount.pass}`)
      console.log(`   Inbox: https://ethereal.email/login`)
      console.log("═══════════════════════════════════════════════════════════")

      return { transporter, testAccount }
    },
    catch: (error) => ({
      _tag: "EmailSendError" as const,
      message: "Failed to create Ethereal test account",
      cause: error
    })
  })

const makeEtherealEmailService = (
  config: EtherealConfig
): EmailServiceInterface => ({
  send: (email: EmailContent) =>
    Effect.tryPromise({
      try: async () => {
        const info = await config.transporter.sendMail({
          from: `"Event Triggers PoC" <noreply@poc.local>`,
          to: email.to,
          subject: email.subject,
          text: email.body,
          // Simple HTML version for nicer display
          html: `<pre style="font-family: monospace; white-space: pre-wrap;">${email.body}</pre>`
        })

        // Get the preview URL
        const previewUrl = nodemailer.getTestMessageUrl(info)

        console.log("═══════════════════════════════════════════════════════════")
        console.log("📧 EMAIL SENT (Ethereal)")
        console.log("═══════════════════════════════════════════════════════════")
        console.log(`   To:      ${email.to}`)
        console.log(`   Subject: ${email.subject}`)
        console.log(`   Preview: ${previewUrl}`)
        console.log("═══════════════════════════════════════════════════════════")
      },
      catch: (error) => ({
        _tag: "EmailSendError" as const,
        message: `Failed to send email: ${error}`,
        cause: error
      })
    })
})

// =============================================================================
// Layer — Creates Ethereal config on startup, shares it across requests
// =============================================================================
//
// EFFECT PATTERN: Layer.effect for async initialization
// The Ethereal account is created once at startup, then reused.
//

export const EtherealEmailService: Layer.Layer<EmailService, EmailError> =
  Layer.effect(
    EmailService,
    Effect.gen(function* () {
      const config = yield* createEtherealConfig()
      return makeEtherealEmailService(config)
    })
  )
