// =============================================================================
// GetUser Use Case Tests — TDD Style
// =============================================================================
//
// RED: Write failing tests first
// GREEN: Implement to make them pass
// REFACTOR: Clean up
//
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { getUser } from "../../src/usecases/GetUser.js"
import { createUser } from "../../src/usecases/CreateUser.js"
import { createAddress } from "../../src/usecases/CreateAddress.js"
import { updateAddressField } from "../../src/usecases/UpdateAddressField.js"
import { revertChange } from "../../src/usecases/RevertChange.js"
import { InMemoryEventStores } from "../../src/infrastructure/InMemoryEventStore.js"
import { makeCaptureEmailService } from "../../src/infrastructure/ConsoleEmailService.js"
import { makeRegistryLayer } from "../../src/Registry.js"
import { makeTestIdGenerator, IdGenerator } from "../../src/IdGenerator.js"
import { EmailService } from "../../src/EmailService.js"
import type { RevertToken } from "../../src/domain/address/State.js"

describe("GetUser use case", () => {
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

  it.effect("returns user with no addresses when user has none", () =>
    Effect.gen(function* () {
      const { layer } = makeTestLayer()

      yield* Effect.gen(function* () {
        // Create user
        yield* createUser({
          email: "jean@example.com" as any,
          firstName: "Jean" as any,
          lastName: "Dupont" as any
        })

        // Get user
        const result = yield* getUser({ nickname: "jean-dupont" })

        expect(result.user.firstName).toBe("Jean")
        expect(result.user.lastName).toBe("Dupont")
        expect(result.user.email).toBe("jean@example.com")
        expect(result.addresses).toHaveLength(0)
      }).pipe(Effect.provide(layer))
    })
  )

  it.effect("returns user with addresses", () =>
    Effect.gen(function* () {
      const { layer } = makeTestLayer()

      yield* Effect.gen(function* () {
        // Create user
        yield* createUser({
          email: "jean@example.com" as any,
          firstName: "Jean" as any,
          lastName: "Dupont" as any
        })

        // Create two addresses
        yield* createAddress({
          nickname: "jean-dupont",
          label: "home" as any,
          streetNumber: "42" as any,
          streetName: "Rue de Rivoli" as any,
          zipCode: "75001" as any,
          city: "Paris" as any,
          country: "France" as any
        })

        yield* createAddress({
          nickname: "jean-dupont",
          label: "work" as any,
          streetNumber: "1" as any,
          streetName: "Avenue des Champs-Élysées" as any,
          zipCode: "75008" as any,
          city: "Paris" as any,
          country: "France" as any
        })

        // Get user
        const result = yield* getUser({ nickname: "jean-dupont" })

        expect(result.user.firstName).toBe("Jean")
        expect(result.addresses).toHaveLength(2)

        const labels = result.addresses.map(a => a.label)
        expect(labels).toContain("home")
        expect(labels).toContain("work")
      }).pipe(Effect.provide(layer))
    })
  )

  it.effect("reflects address updates", () =>
    Effect.gen(function* () {
      const { layer } = makeTestLayer()

      yield* Effect.gen(function* () {
        // Create user and address
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

        // Update city
        yield* updateAddressField({
          nickname: "jean-dupont",
          label: "home",
          field: "city",
          value: "Lyon"
        })

        // Get user — should see updated city
        const result = yield* getUser({ nickname: "jean-dupont" })

        expect(result.addresses[0].city).toBe("Lyon")
      }).pipe(Effect.provide(layer))
    })
  )

  it.effect("reflects reverted changes", () =>
    Effect.gen(function* () {
      const { layer } = makeTestLayer()

      yield* Effect.gen(function* () {
        // Create user and address
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

        // Update city
        yield* updateAddressField({
          nickname: "jean-dupont",
          label: "home",
          field: "city",
          value: "Lyon"
        })

        // Revert the change (token test-4: test-1=userId, test-2=addressId, test-3=createRevert, test-4=updateRevert)
        yield* revertChange({ token: "test-4" as RevertToken })

        // Get user — should see original city
        const result = yield* getUser({ nickname: "jean-dupont" })

        expect(result.addresses[0].city).toBe("Paris")
      }).pipe(Effect.provide(layer))
    })
  )

  it.effect("fails with UserNotFound for unknown nickname", () =>
    Effect.gen(function* () {
      const { layer } = makeTestLayer()

      yield* Effect.gen(function* () {
        const result = yield* getUser({ nickname: "nonexistent" }).pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("UserNotFound")
        }
      }).pipe(Effect.provide(layer))
    })
  )
})
