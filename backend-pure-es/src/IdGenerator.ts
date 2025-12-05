// =============================================================================
// IdGenerator — Service for Generating Unique IDs
// =============================================================================
//
// WHY A SERVICE?
// ID generation is a side effect — it produces different results each time.
// Making it a service allows:
//   - Testability: inject deterministic IDs in tests
//   - Traceability: explicit dependency in Effect's R parameter
//   - Swappability: different strategies (UUID, ULID, etc.)
//
// DE GOES PRINCIPLE:
// "Make effects explicit. If it's not pure, it's a service."
//
// EFFECT PATTERN:
// Simple service with one method: generate() → Effect<string>
// Branded ID types (UserId, AddressId) are created by callers.
//
import { Context, Effect, Layer } from "effect"

// =============================================================================
// IdGenerator Service Interface
// =============================================================================

export interface IdGeneratorService {
  /**
   * Generate a unique ID.
   * Returns a string that can be branded by the caller.
   */
  readonly generate: () => Effect.Effect<string>
}

// =============================================================================
// IdGenerator Tag
// =============================================================================

export class IdGenerator extends Context.Tag("IdGenerator")<
  IdGenerator,
  IdGeneratorService
>() {}

// =============================================================================
// Production Implementation: UUID
// =============================================================================

export const UuidIdGenerator: IdGeneratorService = {
  generate: () => Effect.sync(() => crypto.randomUUID())
}

export const UuidIdGeneratorLive = Layer.succeed(IdGenerator, UuidIdGenerator)

// =============================================================================
// Test Implementation: Deterministic
// =============================================================================
//
// For tests, we want predictable IDs.
// This implementation returns sequential IDs with a prefix.
//

export const makeTestIdGenerator = (prefix: string = "test"): IdGeneratorService => {
  let counter = 0
  return {
    generate: () => Effect.sync(() => `${prefix}-${++counter}`)
  }
}

// Layer.effect creates a FRESH generator each time the layer is provided
// This is essential for test isolation — each test gets counter starting at 0
export const TestIdGeneratorLive = Layer.effect(
  IdGenerator,
  Effect.sync(() => makeTestIdGenerator())
)
