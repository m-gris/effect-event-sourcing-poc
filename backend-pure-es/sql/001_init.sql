-- =============================================================================
-- Event Triggers PoC — Initial Schema
-- =============================================================================
--
-- EVENT SOURCING SCHEMA:
-- One events table stores all domain events (User + Address aggregates).
-- Stream isolation via stream_id (userId or addressId).
-- Optimistic concurrency via version column.
--
-- REGISTRY TABLES:
-- Denormalized lookup tables for fast queries.
-- Could be derived from events, but pre-computed for performance.
--

-- -----------------------------------------------------------------------------
-- Events Table
-- -----------------------------------------------------------------------------
-- Single table for all event types (User and Address events).
-- stream_id identifies the aggregate (userId or addressId).
-- version enables optimistic concurrency control.

CREATE TABLE IF NOT EXISTS events (
    id              BIGSERIAL PRIMARY KEY,
    stream_id       TEXT NOT NULL,
    stream_type     TEXT NOT NULL,           -- 'user' or 'address'
    version         INTEGER NOT NULL,
    event_type      TEXT NOT NULL,           -- e.g., 'UserCreated', 'CityChanged'
    payload         JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure ordered, gapless versions per stream
    UNIQUE (stream_id, version)
);

-- Index for loading events by stream
CREATE INDEX IF NOT EXISTS idx_events_stream_id ON events (stream_id, version);

-- Index for global ordering (for projections/subscriptions)
CREATE INDEX IF NOT EXISTS idx_events_id ON events (id);

-- -----------------------------------------------------------------------------
-- Registry: Nickname Lookup
-- -----------------------------------------------------------------------------
-- Maps nickname → user_id for URL routing.

CREATE TABLE IF NOT EXISTS nicknames (
    nickname        TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL UNIQUE
);

-- -----------------------------------------------------------------------------
-- Registry: Address Label Lookup
-- -----------------------------------------------------------------------------
-- Maps (user_id, label) → address_id.
-- A user can have multiple addresses, each with a unique label.

CREATE TABLE IF NOT EXISTS address_labels (
    user_id         TEXT NOT NULL,
    label           TEXT NOT NULL,
    address_id      TEXT NOT NULL UNIQUE,

    PRIMARY KEY (user_id, label)
);

-- Index for looking up all addresses for a user
CREATE INDEX IF NOT EXISTS idx_address_labels_user_id ON address_labels (user_id);

-- -----------------------------------------------------------------------------
-- Registry: Revert Token Lookup
-- -----------------------------------------------------------------------------
-- Maps revert_token → address_id for one-time revert links.
-- Tokens are deleted after use (consumed).

CREATE TABLE IF NOT EXISTS revert_tokens (
    token           TEXT PRIMARY KEY,
    address_id      TEXT NOT NULL
);

-- Index for cleanup queries (optional, for maintenance)
CREATE INDEX IF NOT EXISTS idx_revert_tokens_address_id ON revert_tokens (address_id);
