// =============================================================================
// HTTP API Definition
// =============================================================================
//
// EFFECT PLATFORM PATTERN:
// 1. Define the API schema (HttpApi + HttpApiGroup + HttpApiEndpoint)
// 2. Implement handlers (HttpApiBuilder.group)
// 3. Serve (HttpApiBuilder.serve)
//
// The schema is the single source of truth — it defines:
// - Request/response shapes (with validation via Schema)
// - Error responses
// - URL paths and methods
//
// SCALA ANALOGY:
// Like tapir or http4s with typed endpoints. Define once, derive client + server.
//
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup
} from "@effect/platform"
import { Effect, Layer, Schema } from "effect"

// Import use cases
import { createUser } from "../usecases/CreateUser.js"
import { createAddress } from "../usecases/CreateAddress.js"

// Import types for request/response schemas
import { Email } from "../shared/Email.js"
import { FirstName, LastName } from "../domain/user/State.js"
import { Label, StreetNumber, StreetName, ZipCode, City, Country } from "../domain/address/State.js"

// =============================================================================
// Request/Response Schemas
// =============================================================================

// CreateUser
const CreateUserRequest = Schema.Struct({
  email: Email.schema,
  firstName: FirstName,
  lastName: LastName
})

const CreateUserResponse = Schema.Struct({
  nickname: Schema.String,
  email: Email.schema,
  firstName: FirstName,
  lastName: LastName
})

// CreateAddress
const CreateAddressRequest = Schema.Struct({
  label: Label,
  streetNumber: StreetNumber,
  streetName: StreetName,
  zipCode: ZipCode,
  city: City,
  country: Country
})

const CreateAddressResponse = Schema.Struct({
  label: Label,
  streetNumber: StreetNumber,
  streetName: StreetName,
  zipCode: ZipCode,
  city: City,
  country: Country
})

// =============================================================================
// Error Schemas
// =============================================================================

class UserAlreadyExistsError extends Schema.TaggedError<UserAlreadyExistsError>()(
  "UserAlreadyExistsError",
  { message: Schema.String }
) {}

class NicknameAlreadyExistsError extends Schema.TaggedError<NicknameAlreadyExistsError>()(
  "NicknameAlreadyExistsError",
  { message: Schema.String }
) {}

class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
  "UserNotFoundError",
  { message: Schema.String }
) {}

class LabelAlreadyExistsError extends Schema.TaggedError<LabelAlreadyExistsError>()(
  "LabelAlreadyExistsError",
  { message: Schema.String }
) {}

class AddressAlreadyExistsError extends Schema.TaggedError<AddressAlreadyExistsError>()(
  "AddressAlreadyExistsError",
  { message: Schema.String }
) {}

// =============================================================================
// API Definition
// =============================================================================

// Users group
const UsersGroup = HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.post("createUser", "/users")
      .setPayload(CreateUserRequest)
      .addSuccess(CreateUserResponse)
      .addError(UserAlreadyExistsError, { status: 409 })
      .addError(NicknameAlreadyExistsError, { status: 409 })
  )

// Addresses group
const AddressesGroup = HttpApiGroup.make("addresses")
  .add(
    HttpApiEndpoint.post("createAddress", "/users/:nickname/addresses")
      .setPath(Schema.Struct({ nickname: Schema.String }))
      .setPayload(CreateAddressRequest)
      .addSuccess(CreateAddressResponse)
      .addError(UserNotFoundError, { status: 404 })
      .addError(LabelAlreadyExistsError, { status: 409 })
      .addError(AddressAlreadyExistsError, { status: 409 })
  )

// Full API
export const Api = HttpApi.make("EventTriggersApi")
  .add(UsersGroup)
  .add(AddressesGroup)

export type Api = typeof Api

// =============================================================================
// API Implementation (Handlers)
// =============================================================================

// NOTE: Service imports not needed here — use cases pull them via Effect context.
// Keeping these commented for reference when adding direct service access.
// import { IdGenerator } from "../IdGenerator.js"
// import { UserEventStore, AddressEventStore } from "../EventStore.js"
// import { Registry } from "../Registry.js"
// import { EmailService } from "../EmailService.js"

// Users handlers
const UsersHandlers = HttpApiBuilder.group(Api, "users", (handlers) =>
  handlers.handle("createUser", ({ payload }) =>
    Effect.gen(function* () {
      const result = yield* createUser(payload)
      return {
        nickname: result.nickname,
        email: result.email,
        firstName: result.firstName,
        lastName: result.lastName
      }
    }).pipe(
      Effect.catchTag("UserAlreadyExists", () =>
        Effect.fail(new UserAlreadyExistsError({ message: "User already exists" }))
      ),
      Effect.catchTag("NicknameAlreadyExists", () =>
        Effect.fail(new NicknameAlreadyExistsError({ message: "A user with this name already exists" }))
      )
    )
  )
)

// Addresses handlers
const AddressesHandlers = HttpApiBuilder.group(Api, "addresses", (handlers) =>
  handlers.handle("createAddress", ({ path, payload }) =>
    Effect.gen(function* () {
      const result = yield* createAddress({
        nickname: path.nickname,
        ...payload
      })
      return {
        label: result.label,
        streetNumber: result.streetNumber,
        streetName: result.streetName,
        zipCode: result.zipCode,
        city: result.city,
        country: result.country
      }
    }).pipe(
      Effect.catchTag("UserNotFound", () =>
        Effect.fail(new UserNotFoundError({ message: "User not found" }))
      ),
      Effect.catchTag("LabelAlreadyExists", () =>
        Effect.fail(new LabelAlreadyExistsError({ message: "Address with this label already exists" }))
      ),
      Effect.catchTag("AddressAlreadyExists", () =>
        Effect.fail(new AddressAlreadyExistsError({ message: "Address already exists" }))
      ),
      // EmailSendError: for PoC, we treat email failures as internal errors (500)
      // In production, you might want a different strategy (retry, queue, etc.)
      Effect.catchTag("EmailSendError", (e) =>
        Effect.die(new Error(`Email send failed: ${e.message}`))
      )
    )
  )
)

// =============================================================================
// API Layer (combines all handlers)
// =============================================================================

export const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(UsersHandlers),
  Layer.provide(AddressesHandlers)
)
