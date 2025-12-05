# API Design

REST API shared by all backend implementations (Pure ES, Hybrid, Pure RDBMS).

## User Identity

No authentication for this PoC. Users are identified by a **derived nickname**:

```
nickname = {firstName}-{lastName}  (lowercase, hyphenated)
```

**This is a computed field**, not user-provided. The system derives it from `firstName` and `lastName` at creation time. Users never input or choose their nickname.

Example: User with `firstName: "Jean"`, `lastName: "Dupont"` → nickname `jean-dupont` → `/users/jean-dupont/...`

## Address Identity

Addresses are identified by their **label** (unique per user):

```
/users/jean-dupont/addresses/home
/users/jean-dupont/addresses/work
```

Labels are human-readable and match the domain model.

---

## Endpoints

### User Management

#### Create User
```
POST /users
Content-Type: application/json

{
  "email": "jean.dupont@example.com",
  "firstName": "Jean",
  "lastName": "Dupont"
}

→ 201 Created
{
  "nickname": "jean-dupont",
  "email": "jean.dupont@example.com",
  "firstName": "Jean",
  "lastName": "Dupont"
}
```

#### Get User (with addresses)
```
GET /users/:nickname

→ 200 OK
{
  "nickname": "jean-dupont",
  "email": "jean.dupont@example.com",
  "firstName": "Jean",
  "lastName": "Dupont",
  "addresses": [
    {
      "label": "home",
      "streetNumber": "42",
      "streetName": "Rue de Rivoli",
      "zipCode": "75001",
      "city": "Paris",
      "country": "France"
    }
  ]
}
```

---

### Address Management

#### Create Address
```
POST /users/:nickname/addresses
Content-Type: application/json

{
  "label": "home",
  "streetNumber": "42",
  "streetName": "Rue de Rivoli",
  "zipCode": "75001",
  "city": "Paris",
  "country": "France"
}

→ 201 Created
{
  "label": "home",
  "streetNumber": "42",
  "streetName": "Rue de Rivoli",
  "zipCode": "75001",
  "city": "Paris",
  "country": "France"
}
```

Triggers: Email sent to user with revert link.

#### Get Address
```
GET /users/:nickname/addresses/:label

→ 200 OK
{
  "label": "home",
  "streetNumber": "42",
  ...
}
```

#### Update Address Field
```
PATCH /users/:nickname/addresses/:label
Content-Type: application/json

{
  "city": "Lyon"
}

→ 200 OK
{
  "label": "home",
  "streetNumber": "42",
  "streetName": "Rue de Rivoli",
  "zipCode": "75001",
  "city": "Lyon",
  "country": "France"
}
```

**Constraint**: Only ONE field can be updated at a time (per spec).

Triggers: Email sent to user mentioning which field changed, with revert link.

#### Delete Address
```
DELETE /users/:nickname/addresses/:label

→ 204 No Content
```

Triggers: Email sent to user with restore link.

---

### Revert (from email link)

#### Revert a Change
```
GET /revert/:token

→ 200 OK
{
  "message": "Change reverted successfully",
  "field": "city",
  "revertedFrom": "Lyon",
  "revertedTo": "Paris"
}
```

Or for creation revert:
```
→ 200 OK
{
  "message": "Address creation reverted",
  "label": "home"
}
```

Or for deletion revert (restore):
```
→ 200 OK
{
  "message": "Address restored",
  "label": "home"
}
```

**No email triggered** — corrections are silent.

#### Invalid/Expired Token
```
GET /revert/:token

→ 400 Bad Request
{
  "error": "RevertTokenInvalid",
  "message": "This revert link is invalid or has already been used"
}
```

---

## Error Responses

All errors follow a consistent shape:

```json
{
  "error": "ErrorTag",
  "message": "Human-readable description"
}
```

### Common Errors

| Status | Error Tag | When |
|--------|-----------|------|
| 400 | `ValidationError` | Invalid request body |
| 400 | `RevertTokenInvalid` | Token unknown or already used |
| 404 | `UserNotFound` | Nickname doesn't match any user |
| 404 | `AddressNotFound` | Label doesn't match any address for user |
| 409 | `UserAlreadyExists` | User with same name already exists |
| 409 | `AddressAlreadyExists` | Address with same label already exists |

---

## Flow: What Happens on Each Request

### Address Update Flow

```
1. HTTP: PATCH /users/jean-dupont/addresses/home { city: "Lyon" }
2. Parse request, validate body
3. Lookup user by nickname → get userId + email
4. Lookup address by (userId, label) → get addressId
5. Build command: ChangeCity { addressId, city: "Lyon", revertToken: <generate> }
6. Execute: commandHandler(streamId, command) → [CityChanged event]
7. React: reactToAddressEvent(event, userEmail) → send email
8. HTTP: 200 OK with updated address
```

### Revert Flow

```
1. HTTP: GET /revert/token-abc-123
2. Lookup which address has this token in pendingReverts
3. Build command: RevertChange { addressId, revertToken }
4. Execute: commandHandler(streamId, command) → [CityReverted event]
5. React: reactToAddressEvent(event, userEmail) → Effect.void (no email)
6. HTTP: 200 OK with revert confirmation
```

---

## Use Case Layer

The HTTP handlers are thin — they delegate to Use Cases:

```typescript
// Use case orchestrates the full flow
const updateAddressField = (
  nickname: string,
  label: string,
  field: string,
  value: string
): Effect<Address, AppError, UserRepo | AddressCommandHandler | EmailService>
```

This keeps HTTP layer focused on:
- Parsing requests
- Calling use cases
- Formatting responses

---

## Implementation Plan (Pure ES Backend)

### The Demo Story

What the boss needs to see:

1. **Create user** → `POST /users` → no email (just setup)
2. **Create address** → `POST /users/jean-dupont/addresses` → 📧 email arrives!
3. **Update city** → `PATCH /users/jean-dupont/addresses/home` → 📧 another email!
4. **Click revert link** → `GET /revert/:token` → city reverts, NO email
5. **View user** → `GET /users/jean-dupont` → see city is back to Paris

### The Missing Piece: Registry (Lookups)

We have `EventStore` keyed by `StreamId` (= aggregateId). But the API uses human-readable identifiers:

| API uses | Need to find |
|----------|--------------|
| nickname | → userId |
| label | → addressId |
| token | → addressId (for revert) |

**Solution:** In-memory **Registry** — a **projection** (read model derived from events)

```typescript
Registry
  ├── nicknameToUserId: Map<string, UserId>      // from UserCreated
  ├── (userId, label) → addressId: Map<string, AddressId>  // from AddressCreated
  └── token → addressId: Map<RevertToken, AddressId>       // from events with revertToken
```

Updated by projecting events — `registry.projectUserEvent(event)` / `registry.projectAddressEvent(event)`.
The registry subscribes to events and builds indexes. Proper event sourcing, not imperative updates.

### Build Order

| # | Component | Purpose | TDD |
|---|-----------|---------|-----|
| 1 | **Registry** | Lookup indexes | Light (maps) |
| 2 | **CreateUser** use case | Need user first | 1 happy path |
| 3 | **CreateAddress** use case | Need address, triggers email | 1 test |
| 4 | **UpdateAddressField** use case | Core demo flow | 1 test |
| 5 | **RevertChange** use case | The climax — no email | 1 test |
| 6 | **HTTP routes** | Thin glue over use cases | Manual test |
| 7 | **Main** | Wire layers, start server | Manual test |

### Use Case Pattern

Each use case follows the same structure:

```typescript
const createAddress = (nickname, addressData) =>
  Effect.gen(function* () {
    // 1. Lookup prerequisites
    const registry = yield* Registry
    const userId = yield* registry.getUserIdByNickname(nickname)
    const user = yield* loadUserState(userId)  // need email for reaction

    // 2. Generate IDs
    const addressId = generateAddressId()
    const revertToken = generateRevertToken()

    // 3. Execute command
    const command = { _tag: "CreateAddress", id: addressId, revertToken, ...addressData }
    const events = yield* addressCommandHandler(StreamId(addressId), command)

    // 4. Project events to registry (event-driven, not imperative)
    for (const event of events) {
      yield* registry.projectAddressEvent(event)
    }

    // 5. React (send email)
    for (const event of events) {
      yield* reactToAddressEvent(event, user.email)
    }

    // 6. Return result
    return { ...addressData, id: addressId }
  })
```

### File Structure (to create)

```
src/
├── Registry.ts              # Projection — read model derived from events
├── usecases/
│   ├── CreateUser.ts
│   ├── CreateAddress.ts
│   ├── UpdateAddressField.ts
│   ├── RevertChange.ts
│   └── GetUser.ts           # Read-only, no command
├── http/
│   ├── routes.ts            # All route definitions
│   └── server.ts            # HTTP server setup
└── main.ts                  # Wire everything, start

test/
└── usecases/
    ├── CreateUser.test.ts
    ├── CreateAddress.test.ts
    ├── UpdateAddressField.test.ts
    └── RevertChange.test.ts
```

### Endpoints → Use Cases Mapping

| Endpoint | Use Case | Triggers Email |
|----------|----------|----------------|
| `POST /users` | CreateUser | ❌ |
| `GET /users/:nickname` | GetUser | ❌ |
| `POST /users/:nickname/addresses` | CreateAddress | ✅ |
| `PATCH /users/:nickname/addresses/:label` | UpdateAddressField | ✅ |
| `DELETE /users/:nickname/addresses/:label` | DeleteAddress | ✅ |
| `GET /revert/:token` | RevertChange | ❌ (silent) |

### What We Skip for MVP

- `GET /users/:nickname/addresses/:label` — can see address in GET user response
- `DELETE` — nice to have, not critical for demo
- Ethereal email — Console adapter shows emails in terminal
- Frontend — curl is enough for demo
