# PostgreSQL Event Sourcing Landscape

## Purpose

Research summary on PostgreSQL-based event sourcing options — native features, extensions, and libraries.

---

## Key Finding

**No native PostgreSQL extension for event sourcing exists** (unlike `pg_vector` for embeddings or `pg_ai` for ML).

The ecosystem approach is: **use PostgreSQL's built-in primitives + an application-layer library** (or roll your own).

---

## Native PostgreSQL Primitives

PostgreSQL has built-in features that can be composed for event-driven patterns:

| Feature | What it does |
|---------|--------------|
| **LISTEN/NOTIFY** | Pub/sub between DB connections — triggers can push events to listeners |
| **Triggers** | Fire on INSERT/UPDATE/DELETE — can call `pg_notify()` |
| **JSONB** | Flexible event payload storage with indexing |
| **SERIAL/BIGSERIAL** | Auto-incrementing sequence numbers for event ordering |

These are building blocks, not a turnkey event store.

### LISTEN/NOTIFY Details

- Asynchronous notification system between database connections
- Payload limit: 8KB per message (sufficient for JSON-encoded events)
- Queue size: 8GB in standard installation
- Can be triggered automatically via database triggers on table changes

### Example: Trigger with NOTIFY

```sql
CREATE OR REPLACE FUNCTION notify_event() RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('events', row_to_json(NEW)::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_inserted
    AFTER INSERT ON events
    FOR EACH ROW EXECUTE FUNCTION notify_event();
```

---

## Application-Layer Libraries

These are not PostgreSQL extensions — they're libraries in various languages that use PostgreSQL as their backing store.

| Library | Language | Notes |
|---------|----------|-------|
| [Marten](https://martendb.io/events/) | .NET | Full-featured, rich projections support |
| [Emmett](https://event-driven.io/en/emmett_postgresql_event_store/) | Node.js/TypeScript | Inline projections (same transaction), newer |
| [Eventuous](https://eventuous.dev/docs/infra/postgres/) | .NET | Catch-up subscriptions to streams |
| [commanded/eventstore](https://github.com/commanded/eventstore) | Elixir | Cluster support, mature |
| [fstore-sql](https://github.com/fraktalio/fstore-sql) | Pure SQL | No framework needed, prototyping-friendly |
| [postgresql-event-sourcing](https://github.com/eugene-khyst/postgresql-event-sourcing) | Java/Spring Boot | Reference implementation, well-documented |

---

## Notable Tool: pg_eventserv

[pg_eventserv](https://www.crunchydata.com/blog/real-time-database-events-with-pg_eventserv) from Crunchy Data.

- **Not an event store** — a bridge/proxy
- Converts PostgreSQL LISTEN/NOTIFY → **WebSockets**
- Useful for pushing DB events to web frontends in real-time
- Combines with triggers for reactive UIs

---

## Typical Schema Pattern

Most implementations converge on a similar table structure:

```sql
CREATE TABLE events (
    sequence_num BIGSERIAL PRIMARY KEY,
    stream_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_stream_id ON events (stream_id);
```

Key principles:
- **Append-only**: INSERT only, never UPDATE or DELETE
- **Immutable**: Events are facts that happened
- **Ordered**: `sequence_num` provides global ordering

---

## Scalability Notes

From community experience:
- 32 million rows is comfortable for PostgreSQL
- One production system reported ~1 million events over 6 years running on micro instances
- JSONB with proper indexing scales well
- Partitioning available if needed at higher volumes

---

## Sources

- [PostgreSQL Official Documentation: NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html)
- [Crunchy Data: pg_eventserv](https://www.crunchydata.com/blog/real-time-database-events-with-pg_eventserv)
- [DEV.to: Lightweight Event Sourcing with PostgreSQL](https://dev.to/eugene-khyst/lightweight-implementation-of-event-sourcing-using-postgresql-as-an-event-store-59h7)
- [Medium: Event Sourcing with PostgreSQL](https://medium.com/@tobyhede/event-sourcing-with-postgresql-28c5e8f211a2)
- [Event-Driven.io: Emmett PostgreSQL Event Store](https://event-driven.io/en/emmett_postgresql_event_store/)
- [SoftwareMill: Implementing Event Sourcing with Relational Database](https://softwaremill.com/implementing-event-sourcing-using-a-relational-database/)
