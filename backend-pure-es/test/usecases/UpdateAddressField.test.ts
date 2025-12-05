// =============================================================================
// UpdateAddressField Use Case Tests — TDD Style
// =============================================================================
//
// RED: Write tests for expected behavior
// GREEN: Make them pass
// REFACTOR: Clean up if needed
//
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { updateAddressField } from "../../src/usecases/UpdateAddressField.js"
import { createUser } from "../../src/usecases/CreateUser.js"
import { createAddress } from "../../src/usecases/CreateAddress.js"
import { InMemoryEventStores } from "../../src/infrastructure/InMemoryEventStore.js"
import { makeCaptureEmailService } from "../../src/infrastructure/ConsoleEmailService.js"
import { makeRegistryLayer } from "../../src/Registry.js"
import { makeTestIdGenerator } from "../../src/IdGenerator.js"
import { IdGenerator } from "../../src/IdGenerator.js"
import { EmailService } from "../../src/EmailService.js"

describe("UpdateAddressField use case", () => {
  // Helper to build test layer with email capture
  const makeTestLayer = () => {
    const emailCapture = makeCaptureEmailService()
    const layer = Layer.mergeAll(
      InMemoryEventStores,
      Layer.succeed(EmailService, emailCapture.service),
      makeRegistryLayer(),
      Layer.succeed(IdGenerator, makeTestIdGenerator())
    )
    return { layer, emailCapture }
  }

  it.effect("updates city and sends field-specific email", () =>
    Effect.gen(function* () {
      const { layer, emailCapture } = makeTestLayer()

      yield* Effect.gen(function* () {
        // Setup: create user and address
        yield* createUser({
          email: "jean@example.com" as any,
          firstName: "Jean" as any,
          lastName: "Dupont" as any
        })

        yield* createAddress({
          nickname: "jean-dupont",
          label: "home" as any,
          streetNumber: "42" as any,
          streetName: "Rue de Rivoli" as any,
          zipCode: "75001" as any,
          city: "Paris" as any,
          country: "France" as any
        })

        // Clear emails from setup
        emailCapture.clear()

        // Act: update the city
        const result = yield* updateAddressField({
          nickname: "jean-dupont",
          label: "home",
          field: "city",
          value: "Lyon"
        })

        // Assert: result
        expect(result.field).toBe("city")
        expect(result.oldValue).toBe("Paris")
        expect(result.newValue).toBe("Lyon")

        // Assert: email sent with city-specific content
        const emails = emailCapture.getSentEmails()
        expect(emails).toHaveLength(1)
        expect(emails[0].subject).toContain("City Changed")
        expect(emails[0].body).toContain("Paris")
        expect(emails[0].body).toContain("Lyon")
        expect(emails[0].body).toContain("/revert/")
      }).pipe(Effect.provide(layer))
    })
  )

  it.effect("updates street number and sends different email", () =>
    Effect.gen(function* () {
      const { layer, emailCapture } = makeTestLayer()

      yield* Effect.gen(function* () {
        // Setup
        yield* createUser({
          email: "jean@example.com" as any,
          firstName: "Jean" as any,
          lastName: "Dupont" as any
        })

        yield* createAddress({
          nickname: "jean-dupont",
          label: "home" as any,
          streetNumber: "42" as any,
          streetName: "Rue de Rivoli" as any,
          zipCode: "75001" as any,
          city: "Paris" as any,
          country: "France" as any
        })

        emailCapture.clear()

        // Act: update street number
        const result = yield* updateAddressField({
          nickname: "jean-dupont",
          label: "home",
          field: "streetNumber",
          value: "100"
        })

        // Assert
        expect(result.field).toBe("streetNumber")
        expect(result.oldValue).toBe("42")
        expect(result.newValue).toBe("100")

        const emails = emailCapture.getSentEmails()
        expect(emails).toHaveLength(1)
        expect(emails[0].subject).toContain("Street Number Changed")
      }).pipe(Effect.provide(layer))
    })
  )

  it.effect("no-op when value unchanged (no email)", () =>
    Effect.gen(function* () {
      const { layer, emailCapture } = makeTestLayer()

      yield* Effect.gen(function* () {
        // Setup
        yield* createUser({
          email: "jean@example.com" as any,
          firstName: "Jean" as any,
          lastName: "Dupont" as any
        })

        yield* createAddress({
          nickname: "jean-dupont",
          label: "home" as any,
          streetNumber: "42" as any,
          streetName: "Rue de Rivoli" as any,
          zipCode: "75001" as any,
          city: "Paris" as any,
          country: "France" as any
        })

        emailCapture.clear()

        // Act: "update" to same value
        const result = yield* updateAddressField({
          nickname: "jean-dupont",
          label: "home",
          field: "city",
          value: "Paris" // Same as current
        })

        // Assert: no event, no email
        expect(result.oldValue).toBe("Paris")
        expect(result.newValue).toBe("Paris")

        const emails = emailCapture.getSentEmails()
        expect(emails).toHaveLength(0)
      }).pipe(Effect.provide(layer))
    })
  )

  it.effect("fails with UserNotFound for unknown nickname", () =>
    Effect.gen(function* () {
      const { layer } = makeTestLayer()

      yield* Effect.gen(function* () {
        const result = yield* updateAddressField({
          nickname: "nobody",
          label: "home",
          field: "city",
          value: "Lyon"
        }).pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("UserNotFound")
        }
      }).pipe(Effect.provide(layer))
    })
  )

  it.effect("fails with AddressNotFound for unknown label", () =>
    Effect.gen(function* () {
      const { layer } = makeTestLayer()

      yield* Effect.gen(function* () {
        // Setup: create user but no address
        yield* createUser({
          email: "jean@example.com" as any,
          firstName: "Jean" as any,
          lastName: "Dupont" as any
        })

        const result = yield* updateAddressField({
          nickname: "jean-dupont",
          label: "nonexistent",
          field: "city",
          value: "Lyon"
        }).pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("AddressNotFound")
        }
      }).pipe(Effect.provide(layer))
    })
  )
})
