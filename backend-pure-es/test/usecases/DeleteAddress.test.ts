// =============================================================================
// DeleteAddress Use Case Tests — TDD
// =============================================================================
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { deleteAddress } from "../../src/usecases/DeleteAddress.js"
import { createUser } from "../../src/usecases/CreateUser.js"
import { createAddress } from "../../src/usecases/CreateAddress.js"
import { InMemoryEventStores } from "../../src/infrastructure/InMemoryEventStore.js"
import { makeCaptureEmailService } from "../../src/infrastructure/ConsoleEmailService.js"
import { makeInMemoryRegistryLayer } from "../../src/infrastructure/InMemoryRegistry.js"
import { makeTestIdGenerator, IdGenerator } from "../../src/IdGenerator.js"
import { EmailService } from "../../src/EmailService.js"

describe("DeleteAddress use case", () => {
  const makeTestLayer = () => {
    const emailCapture = makeCaptureEmailService()
    const layer = Layer.mergeAll(
      InMemoryEventStores,
      Layer.succeed(EmailService, emailCapture.service),
      makeInMemoryRegistryLayer(),
      Layer.succeed(IdGenerator, makeTestIdGenerator())
    )
    return { layer, emailCapture }
  }

  it.effect("deletes an existing address and triggers email", () =>
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

        // Act: delete the address
        const result = yield* deleteAddress({
          nickname: "jean-dupont",
          label: "home"
        })

        // Assert
        expect(result.deleted).toBe(true)
        expect(result.label).toBe("home")

        // Check email was sent (3 total: user created doesn't send, address created sends 1, delete sends 1)
        // Actually: CreateUser=0, CreateAddress=1, DeleteAddress=1 → 2 emails
        const emails = emailCapture.getSentEmails()
        expect(emails.length).toBeGreaterThanOrEqual(1)
        // Last email should be about deletion
        const lastEmail = emails[emails.length - 1]
        expect(lastEmail.subject.toLowerCase()).toContain("deleted")
      }).pipe(Effect.provide(layer))
    })
  )

  it.effect("fails with UserNotFound for unknown nickname", () =>
    Effect.gen(function* () {
      const { layer } = makeTestLayer()

      yield* Effect.gen(function* () {
        const result = yield* deleteAddress({
          nickname: "nonexistent",
          label: "home"
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
        // Setup: create user only (no address)
        yield* createUser({
          email: "jean@example.com" as any,
          firstName: "Jean" as any,
          lastName: "Dupont" as any
        })

        const result = yield* deleteAddress({
          nickname: "jean-dupont",
          label: "nonexistent"
        }).pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("AddressNotFound")
        }
      }).pipe(Effect.provide(layer))
    })
  )
})
