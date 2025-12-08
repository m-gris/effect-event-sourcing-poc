// =============================================================================
// HTTP API Integration Test
// =============================================================================
//
// MINIMAL TDD: Test the vertical slice end-to-end.
// POST /users → POST /users/:nickname/addresses → email triggered
//
// We use HttpApiBuilder.toWebHandler to test without a real server.
// This creates an in-memory handler we can call directly with Request objects.
//
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpApiBuilder, HttpServer } from "@effect/platform"

import { ApiLive } from "../../src/http/Api.js"
import { InMemoryEventStores } from "../../src/infrastructure/InMemoryEventStore.js"
import { makeCaptureEmailServiceLayer } from "../../src/infrastructure/ConsoleEmailService.js"
import { makeInMemoryRegistryLayer } from "../../src/infrastructure/InMemoryRegistry.js"
import { UuidIdGeneratorLive } from "../../src/IdGenerator.js"

describe("HTTP API", () => {
  it.effect("CreateUser → CreateAddress → email triggered", () =>
    Effect.gen(function* () {
      // Setup: capture emails for assertion
      const emailCapture = makeCaptureEmailServiceLayer()

      // Build test layer with all dependencies
      //
      // Layer composition:
      //   - ApiLive NEEDS: IdGenerator, EventStores, Registry, EmailService
      //   - AppDependencies PROVIDES: those services
      //   - HttpServer.layerContext PROVIDES: HttpPlatform, etc. (for toWebHandler)
      //
      // Layer.provide(consumer, provider) — provider feeds into consumer
      //
      const AppDependencies = Layer.mergeAll(
        InMemoryEventStores,
        emailCapture.layer,
        makeInMemoryRegistryLayer(),
        UuidIdGeneratorLive
      )

      const TestLayer = Layer.mergeAll(
        Layer.provide(ApiLive, AppDependencies),
        HttpServer.layerContext
      )

      // Create web handler (no real server needed)
      const { handler, dispose } = HttpApiBuilder.toWebHandler(TestLayer)

      try {
        // 1. Create user
        const createUserResponse = yield* Effect.promise(() =>
          handler(
            new Request("http://localhost/users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: "jean.dupont@example.com",
                firstName: "Jean",
                lastName: "Dupont"
              })
            })
          )
        )

        expect(createUserResponse.status).toBe(200)
        const user = yield* Effect.promise(() => createUserResponse.json())
        expect(user.nickname).toBe("jean-dupont")
        expect(user.email).toBe("jean.dupont@example.com")

        // 2. Create address for user
        const createAddressResponse = yield* Effect.promise(() =>
          handler(
            new Request("http://localhost/users/jean-dupont/addresses", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                label: "home",
                streetNumber: "42",
                streetName: "Rue de Rivoli",
                zipCode: "75001",
                city: "Paris",
                country: "France"
              })
            })
          )
        )

        expect(createAddressResponse.status).toBe(200)
        const address = yield* Effect.promise(() => createAddressResponse.json())
        expect(address.label).toBe("home")
        expect(address.city).toBe("Paris")

        // 3. Verify email was sent
        const sentEmails = emailCapture.getSentEmails()
        expect(sentEmails).toHaveLength(1)
        expect(sentEmails[0].subject).toContain("Address Created")
        expect(sentEmails[0].body).toContain("home")
        expect(sentEmails[0].body).toContain("/revert/")
      } finally {
        // Cleanup
        yield* Effect.promise(() => dispose())
      }
    })
  )
})
