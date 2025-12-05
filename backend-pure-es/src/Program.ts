// =============================================================================
// Program.ts — Main Entry Point
// =============================================================================
//
// This is the "edge of the world" — where we wire all Layers together and
// launch the HTTP server.
//
// EFFECT PATTERN:
// The application is built as a Layer composition. We declare what we provide,
// Effect handles the wiring. No manual dependency injection, no singletons.
//
// SCALA ANALOGY:
// Like a ZIO app with ZLayer.make — declare the recipe, ZIO bakes the cake.
//
import { Layer } from "effect"
import { HttpApiBuilder } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { createServer } from "node:http"

// API definition and handlers
import { ApiLive } from "./http/Api.js"

// Infrastructure adapters
import { InMemoryEventStores } from "./infrastructure/InMemoryEventStore.js"
import { ConsoleEmailService } from "./infrastructure/ConsoleEmailService.js"

// Application services
import { makeRegistryLayer } from "./Registry.js"
import { UuidIdGeneratorLive } from "./IdGenerator.js"

// =============================================================================
// Server Configuration
// =============================================================================

const PORT = 3000

// =============================================================================
// Layer Composition
// =============================================================================

// Application dependencies (services needed by use cases)
const AppDependencies = Layer.mergeAll(
  InMemoryEventStores,
  ConsoleEmailService,
  makeRegistryLayer(),
  UuidIdGeneratorLive
)

// HTTP server layer
const HttpServerLive = NodeHttpServer.layer(createServer, { port: PORT })

// Full server stack: API handlers + dependencies + HTTP server
const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ApiLive),
  Layer.provide(AppDependencies),
  Layer.provide(HttpServerLive)
)

// =============================================================================
// Launch
// =============================================================================

console.log(`
═══════════════════════════════════════════════════════════════
  Event Triggers PoC — Pure Event Sourcing Backend
═══════════════════════════════════════════════════════════════
  Server starting on http://localhost:${PORT}

  Endpoints:
    POST /users                          → Create user
    POST /users/:nickname/addresses      → Create address (triggers email!)

  Try it:
    curl -X POST http://localhost:${PORT}/users \\
      -H "Content-Type: application/json" \\
      -d '{"email":"jean@example.com","firstName":"Jean","lastName":"Dupont"}'

    curl -X POST http://localhost:${PORT}/users/jean-dupont/addresses \\
      -H "Content-Type: application/json" \\
      -d '{"label":"home","streetNumber":"42","streetName":"Rue de Rivoli","zipCode":"75001","city":"Paris","country":"France"}'

═══════════════════════════════════════════════════════════════
`)

// Launch the server
Layer.launch(ServerLive).pipe(NodeRuntime.runMain)
