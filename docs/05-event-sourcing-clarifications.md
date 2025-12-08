# Event Sourcing Clarifications

## Purpose

This document captures key clarifications and resolved misconceptions from our discussion about implementing event sourcing for the PoC.

---

## 1. Can Event Sourcing Be Done Without a Database?

**Yes.** Event sourcing only requires an **append-only log**. That log can be:

| Storage | Viability |
|---------|-----------|
| In-memory array | Simplest, data lost on restart |
| JSON file (append lines) | Simple persistence, human-readable |
| SQLite single table | Durable, still "just a file" |
| PostgreSQL | Production-grade, but not required |

**Key insight**: Event sourcing is a *pattern*, not a technology. The storage mechanism is incidental — what matters is immutable events as the source of truth.

---

## 2. Can Pure Event Sourcing Be Done with PostgreSQL?

**Yes, but it requires discipline.**

PostgreSQL won't enforce the pattern — it allows UPDATE and DELETE, which break immutability. Pure event sourcing in Postgres means:

- **Append-only**: INSERT only, never UPDATE or DELETE
- **No "current state" tables as source of truth**: Only disposable projections
- **Events table is the authority**: State is derived by replaying events

The danger for RDBMS-biased teams: the familiar escape hatches (indexes, denormalized tables, updates) are always available, tempting you away from purity.

---

## 3. Is an ORM Like Prisma Useful for Event Sourcing?

**Not really. It's overkill and potentially dangerous.**

| Prisma feature | Event sourcing fit |
|----------------|-------------------|
| `create()` | Fine — appending events |
| `findMany()` | Fine — reading event streams |
| `update()` | **Should never be used** |
| `delete()` | **Should never be used** |
| Relations, joins | Mostly irrelevant |
| Migrations | Awkward — events evolve via versioning, not schema changes |

**Better alternatives**:
- Raw SQL / query builder (pg driver, @effect/sql-pg, Kysely, Knex)
- Dedicated event store library (e.g., Emmett for Node.js)
- Thin custom wrapper: `appendEvent()`, `readStream()`, `readAll()`

---

## 4. Is BullMQ Useful for Event Sourcing?

**Yes, but it's optional — not required.**

BullMQ is a job queue (Redis-based), useful for:
- Async processing (don't block HTTP response)
- Retry logic for unreliable operations (email sending)
- Decoupling producers from consumers

**It's orthogonal to the storage question** — not RDBMS-biased like Prisma. It fits naturally as a "reaction layer" but adds infrastructure complexity (Redis + worker process).

For the PoC: **skip it**. Send emails synchronously to reduce moving parts.

---

## 5. What Is the Projection/Reaction Layer?

**It always exists — the question is how it's implemented.**

The reaction layer connects events to their consequences:

```
Events (source of truth)
        ↓
   [Reaction Layer]
        ↓
Side effects (email sent, state updated, etc.)
```

### Implementation options (without a queue):

| Approach | How it works | Trade-off |
|----------|--------------|-----------|
| **Inline/synchronous** | Call handler right after appending event | Simple, but blocks response |
| **Polling** | Background process checks for new events | Decoupled, but latency |
| **LISTEN/NOTIFY** | Postgres pushes to listeners | Real-time, but fragile if disconnected |
| **Transactional outbox** | Write to outbox table, poll separately | Reliable, but reinventing a queue |

### For this PoC:

**The events themselves ARE the reaction layer.**

- `AddressFieldChanged` → triggers inline `sendEmail()` call with revert link
- `/revert/:token` → appends `AddressFieldReverted` event
- Current state → derived by folding over events

No separate infrastructure needed. The event log is both the trigger record AND the state.

---

## 6. The Full Flow (Immediate Apply + Optional Revert)

The workflow applies changes immediately; email is a safety net, not a gate:

```
1. User edits address field (city: "Paris" → "Lyon")
        ↓
2. System appends AddressFieldChanged event (change is now applied)
        ↓
3. System sends safety email with revert link (inline, sync)
        ↓
4. User sees new value immediately
        ↓
5. (Optional) User clicks revert link if change was unauthorized
        ↓
6. System appends AddressFieldReverted event (restores old value)
```

### Events in the stream:

| Step | Event |
|------|-------|
| 2 | `AddressFieldChanged { field, from, to }` |
| 6 | `AddressFieldReverted { field, from, to }` (only if user reverts) |

### Deriving current state:

- Fold all events in order
- `AddressFieldChanged` updates the field
- `AddressFieldReverted` restores the previous value
- No "pending" state — changes are always applied immediately

---

## 7. How Does the Web Page Update After Revert?

**For this PoC: it doesn't auto-update. User refreshes manually.**

### Options considered:

| Option | Complexity | Real-time? |
|--------|------------|------------|
| **A. Manual refresh** | None | No |
| **B. Polling** | Low | Delayed |
| **C. WebSockets** | Medium | Yes |
| **D. Server-Sent Events (SSE)** | Low-Medium | Yes |
| **E. pg_notify → WS/SSE** | Medium | Yes |

### Decision:

**Option A (manual refresh)** — the core event sourcing lesson doesn't depend on real-time UI. Keeps the PoC focused.

---

## Summary

| Question | Answer |
|----------|--------|
| Event sourcing without a DB? | Yes — file or in-memory works |
| Pure event sourcing with Postgres? | Yes — but requires discipline |
| Prisma useful? | No — wrong paradigm, use raw SQL or thin wrapper |
| BullMQ useful? | Optional — adds realism but also complexity |
| Reaction layer needed? | Yes, but can be inline code, not separate infrastructure |
| Real-time UI? | Skip for PoC — manual refresh is fine |
