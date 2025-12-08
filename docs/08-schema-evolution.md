# Schema Evolution

How to handle schema changes (adding/modifying fields) in an event-sourced system.

## The Challenge

Events are immutable. Once `UserCreated { id, email, firstName, lastName }` is stored, it stays that way forever.

So what happens when we need to add `phoneNumber` to the User aggregate?

---

## Traditional RDBMS Approach

```sql
ALTER TABLE users ADD COLUMN phone_number TEXT;
UPDATE users SET phone_number = '...' WHERE ...;
```

Simple, well-understood. But no history of when/why the phone number was added.

---

## Event Sourcing Approach

### Principle: Events are immutable, schemas evolve forward

Old events stay as-is. New event versions include additional fields. The `evolve` function handles both.

### Adding a Field: Step by Step

**Example:** Add `phoneNumber` to User.

#### 1. Update Event Schema (optional field)

```typescript
// Events.ts
export interface UserCreated {
  readonly _tag: "UserCreated"
  readonly id: UserId
  readonly email: Email
  readonly firstName: FirstName
  readonly lastName: LastName
  readonly phoneNumber?: PhoneNumber  // Optional — old events won't have it
}
```

#### 2. Update State

```typescript
// State.ts
export interface User {
  readonly id: UserId
  readonly email: Email
  readonly firstName: FirstName
  readonly lastName: LastName
  readonly phoneNumber: PhoneNumber | null  // Nullable in state
}
```

#### 3. Handle in `evolve`

```typescript
// evolve.ts
export const evolve = (state: Option<User>, event: UserEvent): Option<User> =>
  Match.value(event).pipe(
    Match.when({ _tag: "UserCreated" }, (e) =>
      Option.some({
        id: e.id,
        email: e.email,
        firstName: e.firstName,
        lastName: e.lastName,
        phoneNumber: e.phoneNumber ?? null  // Default for old events
      })
    ),
    // ... other cases
  )
```

#### 4. Update Projection Table (if using hybrid approach)

```sql
ALTER TABLE users ADD COLUMN phone_number TEXT;
-- Old rows stay NULL, new events populate the column
```

#### 5. Update API

```typescript
// Api.ts — add to request/response schemas
const CreateUserRequest = Schema.Struct({
  email: Email.schema,
  firstName: FirstName,
  lastName: LastName,
  phoneNumber: Schema.optional(PhoneNumber)  // Optional in API too
})
```

---

## What About Old Data?

**Old events:** Stay unchanged. `phoneNumber` field doesn't exist in them.

**Replaying old events:** `evolve` sees `undefined`, uses default (`null`).

**Projection table:** Old rows have `NULL` in `phone_number` column.

**New events:** Include `phoneNumber` if provided.

**Result:** System handles both old and new data gracefully. No data migration needed.

---

## Event Versioning Strategies

### Strategy 1: Optional Fields (Recommended for additions)

New fields are optional. Old events simply don't have them.

```typescript
interface UserCreated {
  // ... existing fields
  phoneNumber?: PhoneNumber  // v2: optional
}
```

**Pros:** Simple, no migration
**Cons:** Field is always optional in event type

### Strategy 2: Event Upcasting

Transform old events to new shape on read.

```typescript
const upcast = (event: StoredEvent): UserEvent => {
  if (event._tag === "UserCreated" && !event.phoneNumber) {
    return { ...event, phoneNumber: null }  // Add default
  }
  return event
}
```

**Pros:** Clean event types, migration logic centralized
**Cons:** Extra layer, must maintain upcasters

### Strategy 3: New Event Type

Create a new event for the new schema.

```typescript
interface UserCreatedV1 { /* old shape */ }
interface UserCreatedV2 { /* new shape with phoneNumber */ }
type UserCreated = UserCreatedV1 | UserCreatedV2
```

**Pros:** Explicit versioning, no ambiguity
**Cons:** More types to manage, `evolve` handles both

---

## Removing a Field

**Don't.** Or rather, don't remove from events — they're history.

Instead:
1. Stop populating the field in new events (set to `null`)
2. Remove from projection table if desired
3. Remove from API responses
4. Keep in event schema for backwards compatibility

Old events still have the field. New events have `null`. Projection ignores it.

---

## Renaming a Field

Treat as: add new field + deprecate old field.

1. Add new field name to event schema
2. Populate both old and new names during transition
3. Update `evolve` to read new name, fall back to old
4. Eventually stop populating old name

```typescript
// Transition period
interface AddressCreated {
  streetName: string      // old
  street?: string         // new (optional during transition)
}

// evolve handles both
const street = e.street ?? e.streetName
```

---

## The Hybrid Advantage

With projection tables, schema evolution is even simpler:

| Change | Events | Projection Table |
|--------|--------|------------------|
| Add field | Optional in schema | `ALTER TABLE ADD COLUMN` |
| Remove field | Keep in schema, stop populating | `ALTER TABLE DROP COLUMN` (optional) |
| Rename field | Add new, deprecate old | `ALTER TABLE RENAME COLUMN` |

The projection table is **derived state** — you can always rebuild it by replaying events. This makes schema changes low-risk: if the migration is wrong, replay from events with fixed logic.

---

## Summary

| Aspect | Traditional DB | Event Sourcing | Hybrid (ES + Projections) |
|--------|---------------|----------------|---------------------------|
| Add field | ALTER + UPDATE | Optional in events, default in evolve | Same + ALTER on projection |
| Remove field | DROP COLUMN | Keep in events, remove from evolve | Same + DROP on projection |
| Rename field | RENAME COLUMN | Add new, deprecate old | Same + RENAME on projection |
| Rollback | Restore from backup | Replay events with old logic | Same |
| Audit trail | Lost on UPDATE | Preserved forever | Preserved in events |

**Key insight:** Events are the source of truth. Projections are disposable views. Schema evolution is about handling both old and new event shapes gracefully.
