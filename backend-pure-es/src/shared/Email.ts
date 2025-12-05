// =============================================================================
// Email — Shared Value Object
// =============================================================================
//
// WHY SHARED?
// Email is used by both:
//   - Domain layer (User aggregate has an email field)
//   - Infrastructure layer (EmailService sends to an email address)
//
// To avoid coupling domain → infrastructure or vice versa, we extract
// Email to a shared location. Both layers import from here.
//
// DDD PERSPECTIVE:
// This is a Value Object — defined purely by its value, no identity.
// Two Email("x@y.com") are interchangeable.
//
// VALIDATION:
// "Make illegal states unrepresentable" — an invalid email can't exist.
// The regex is pragmatic, not RFC-5322 compliant, but catches common errors.
//
import { Schema } from "effect"

// Email validation regex
// Catches: missing @, missing domain, spaces, empty local part
// Allows: most valid emails including + tags, subdomains, etc.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Schema with validation and branding
const EmailSchema = Schema.String.pipe(
  Schema.pattern(EMAIL_PATTERN, {
    message: () => "Invalid email address format"
  }),
  Schema.brand("Email")
)

export type Email = typeof EmailSchema.Type

// Companion object pattern — groups schema and smart constructor
export const Email = {
  schema: EmailSchema,
  // Smart constructor: throws on invalid input
  // Use when you "know" the input is valid (e.g., test fixtures, trusted sources)
  make: (email: string): Email => Schema.decodeSync(EmailSchema)(email)
}
