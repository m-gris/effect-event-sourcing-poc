# Hybrid Event Sourcing Approach

## Purpose

This document explores combining event sourcing with an existing relational database — a pragmatic middle ground between pure RDBMS and pure event sourcing.

---

## The Hybrid Architecture

```
┌─────────────────────────────────────────────────┐
│  Existing RDBMS world                           │
│  ┌─────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ users   │  │ addresses   │  │ orders      │  │
│  │ (table) │  │ (table)     │  │ (table)     │  │
│  └─────────┘  └─────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────┘
                      +
┌─────────────────────────────────────────────────┐
│  Event sourcing layer (for specific workflows)  │
│  ┌─────────────────────────────────────────┐    │
│  │ events (table)                          │    │
│  │ - AddressFieldChanged                   │    │
│  │ - AddressFieldReverted                  │    │
│  │ - AddressCreated / AddressDeleted       │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## Separation of Concerns

| Concern | Where it lives |
|---------|----------------|
| "Who is this user?" | `users` table (RDBMS) |
| "What are their addresses?" | `addresses` table (RDBMS) |
| "What happened and when?" | `events` table (event sourced) |
| "Can a change be reverted?" | `events` table (check if revert token used) |

The **change workflow** is event-sourced. Changes apply immediately to RDBMS; events provide audit trail and revert capability.

---

## The Complete Flow

```
[User clicks "save"]
        ↓
[UPDATE addresses table]  ← change applies immediately
        ↓
[Append: AddressFieldChanged event]
        ↓
[Send safety email with revert link]
        ↓
[User sees new value immediately]
        ↓
    (optionally, later)
        ↓
[User clicks revert link if unauthorized]
        ↓
[Append: AddressFieldReverted event]
        ↓
[UPDATE addresses table]  ← restore old value
```

### Step by step:

1. User edits address field
2. System executes `UPDATE addresses SET city = 'Lyon' WHERE id = ...`
3. System appends `AddressFieldChanged` event (with old/new values)
4. System sends safety email with revert link
5. User sees new value immediately
6. (Optional) User clicks revert link
7. System appends `AddressFieldReverted` event
8. System restores old value in RDBMS

---

## The "Two Sources of Truth" Question

This is the central tension. Three approaches:

### Option A: Events are authoritative, RDBMS is projection

```
Events ──────► Source of truth
                    │
                    ▼
RDBMS tables ──► Derived view (rebuildable from events)
```

- Purist event sourcing
- RDBMS is disposable cache
- Can replay events to rebuild tables

### Option B: RDBMS is authoritative, events are workflow log

```
RDBMS tables ──► Source of truth for current state
                    │
Events ────────► Audit trail + workflow coordination
```

- Pragmatic approach
- Events help with workflows but don't define final state
- Familiar mental model for RDBMS teams

### Option C: RDBMS for state, Events for audit + revert

```
RDBMS tables ─────────► Current state (always up-to-date)
                              │
Events ───────────────► Audit trail + revert capability
```

- Changes apply to RDBMS immediately
- Events record what happened (for audit and revert)
- No "pending" state — revert is a new change, not a confirmation

---

## Recommended for This PoC: Option C

| Concern | Authority | Storage |
|---------|-----------|---------|
| What is current address? | RDBMS | Query addresses table |
| What changes happened? | Events | Query events table |
| Can this change be reverted? | Events | Check if revert token used |

### Why Option C works well:

1. **Keeps existing relational infrastructure** — no big rewrite
2. **Event sourcing applied surgically** — audit and revert, not full ES
3. **Clear mental model** — "tables for state, events for history"
4. **Incremental adoption** — can expand event sourcing later

---

## Comparison Table

| Aspect | Pure RDBMS | Pure Event Sourcing | Hybrid (Option C) |
|--------|------------|---------------------|-------------------|
| Current state query | `SELECT` from table | Replay events | `SELECT` from table |
| Revert capability | Manual (restore from backup?) | Append revert event, refold | Append revert event, UPDATE table |
| Audit trail | Separate audit table (if any) | Built-in (events are history) | Events provide audit |
| Complexity | Low | High | Medium |
| Team familiarity | High (for RDBMS teams) | Low | Medium |
| Migration effort | None | Full rewrite | Incremental |

---

## Implementation Sketch

### Tables

```sql
-- Existing RDBMS tables (unchanged)
CREATE TABLE users (
    id UUID PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    email TEXT
);

CREATE TABLE addresses (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    street_number TEXT,
    street_name TEXT,
    zip_code TEXT,
    city TEXT,
    country TEXT
);

-- New: Event sourcing layer for workflows
CREATE TABLE events (
    sequence_num BIGSERIAL PRIMARY KEY,
    stream_id UUID NOT NULL,          -- e.g., address ID
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_stream_id ON events (stream_id);
```

### Event Types

| Event | Payload |
|-------|---------|
| `AddressCreated` | `{ userId, label, streetNumber, streetName, zipCode, city, country }` |
| `AddressFieldChanged` | `{ field, from, to, revertToken }` |
| `AddressFieldReverted` | `{ field, from, to, revertToken }` |
| `AddressDeleted` | `{ snapshot: { all fields } }` |
| `AddressRestored` | `{ snapshot: { all fields } }` |

### Query: Can this change be reverted?

```sql
-- Check if revert token has been used
SELECT EXISTS (
    SELECT 1 FROM events
    WHERE payload->>'revertToken' = $token
    AND event_type LIKE '%Reverted%'
) AS already_reverted;
```

### On Revert

```sql
BEGIN;
    -- 1. Append revert event
    INSERT INTO events (stream_id, event_type, payload)
    VALUES ($address_id, 'AddressFieldReverted', '{"field": "city", "from": "Lyon", "to": "Paris", "revertToken": "abc123"}');

    -- 2. Update RDBMS table (restore old value)
    UPDATE addresses SET city = 'Paris' WHERE id = $address_id;
COMMIT;
```

Both happen in same transaction — consistency guaranteed.

---

## Benefits of This Approach

1. **No "big bang" migration** — add event sourcing incrementally
2. **Familiar reads** — current state is a simple `SELECT`
3. **Workflow clarity** — pending states live in event stream
4. **Audit built-in** — events provide history
5. **Team-friendly** — RDBMS skills still apply

---

## When to Expand Event Sourcing

Start hybrid, consider expanding if:

- More workflows need pending/confirmation patterns
- Audit requirements grow (who changed what, when)
- Need to replay history or time-travel queries
- Multiple systems need to react to the same events

The hybrid approach is a stepping stone, not a dead end.
