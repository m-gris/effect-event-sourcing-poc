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
import { EtherealEmailService } from "./infrastructure/EtherealEmailService.js"

// Application services
import { makeInMemoryRegistryLayer } from "./infrastructure/InMemoryRegistry.js"
import { UuidIdGeneratorLive } from "./IdGenerator.js"

// =============================================================================
// Server Configuration
// =============================================================================

const PORT = 3000

// Email adapter selection via environment variable
// Usage: EMAIL_ADAPTER=ethereal pnpm start
const EMAIL_ADAPTER = process.env.EMAIL_ADAPTER || "console"

// =============================================================================
// Layer Composition
// =============================================================================

// Select email adapter based on config
const EmailServiceLayer = EMAIL_ADAPTER === "ethereal"
  ? EtherealEmailService
  : ConsoleEmailService

// Application dependencies (services needed by use cases)
const AppDependencies = Layer.mergeAll(
  InMemoryEventStores,
  EmailServiceLayer,
  makeInMemoryRegistryLayer(),
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

const emailAdapterInfo = EMAIL_ADAPTER === "ethereal"
  ? "📬 Ethereal (check console for preview URLs)"
  : "📝 Console (emails logged to terminal)"

console.log(`
═══════════════════════════════════════════════════════════════
  Event Triggers PoC — Pure Event Sourcing Backend
═══════════════════════════════════════════════════════════════
  Server starting on http://localhost:${PORT}
  Email adapter: ${emailAdapterInfo}

  Switch adapters: EMAIL_ADAPTER=ethereal pnpm start

  Endpoints:
    POST  /users                              → Create user
    POST  /users/:nickname/addresses          → Create address (triggers email!)
    PATCH /users/:nickname/addresses/:label   → Update field (field-specific email!)
    POST  /revert/:token                      → Revert change (NO email - silent!)

  Full Demo Flow:
  ───────────────
  1. Create user:
     curl -X POST http://localhost:${PORT}/users \\
       -H "Content-Type: application/json" \\
       -d '{"email":"jean@example.com","firstName":"Jean","lastName":"Dupont"}'

  2. Create address (watch console for email):
     curl -X POST http://localhost:${PORT}/users/jean-dupont/addresses \\
       -H "Content-Type: application/json" \\
       -d '{"label":"home","streetNumber":"42","streetName":"Rue de Rivoli","zipCode":"75001","city":"Paris","country":"France"}'

  3. Update city (watch console for CITY-SPECIFIC email):
     curl -X PATCH http://localhost:${PORT}/users/jean-dupont/addresses/home \\
       -H "Content-Type: application/json" \\
       -d '{"field":"city","value":"Lyon"}'

  4. Revert the change (copy token from email, NO new email sent!):
     curl -X POST http://localhost:${PORT}/revert/YOUR_TOKEN_HERE

═══════════════════════════════════════════════════════════════
`)

// Launch the server
Layer.launch(ServerLive).pipe(NodeRuntime.runMain)
