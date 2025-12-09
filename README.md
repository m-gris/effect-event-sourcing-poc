# Event Triggers PoC

## The Challenge

How do we trigger business logic when user state changes — without building a tangled mess of `funnel_instances`, `funnel_instance_data`, and sync logic?

**The conventional approach:**

```
funnels (definition table)
funnel_instances (user X is in funnel Y at stage Z)
funnel_instance_data (history snapshots)
```

Three tables. Sync issues. Manual history tracking. Schema migrations. The "ORM way."

**The event sourcing answer:**

```
events (append-only log of what happened)
```

One table. Funnel membership is *computed*, not stored. History is intrinsic. No sync.

---

## What This PoC Demonstrates

### Phase 1: Address Triggers (Implemented)

A user edits their address. Different fields trigger different emails. Corrections (reverts) are silent.

```
User changes city: Paris → Lyon
  → Event: CityChanged
  → Reaction: Send "City Changed" email with revert link

User clicks revert link
  → Event: CityReverted
  → Reaction: None (corrections are silent)
```

**What this proves:**
- Events ARE the triggers (no TriggerConfig table)
- Different events → different reactions (pattern matching)
- Revert capability without email loops

### Phase 2: Funnel Triggers (Next Step)

Users do things. From those actions, we infer which "funnels" they belong to. Transitions trigger business logic.

---

## Phase 2 Design: Funnels Without Funnel Tables

### The Core Insight

Users don't have a `funnel_stage` field. They **do things**, and from those actions we compute membership:

| User Action | What It Means |
|-------------|---------------|
| Signed up | New user |
| Started trial | Evaluating |
| Completed onboarding | Engaged |
| Invited teammate | Activated |
| Converted | Customer |
| Churned | Lost |

**Funnels are interpretations of event streams, not stored states.**

### Events (What Happened)

```typescript
type UserBehaviorEvent =
  | { _tag: "UserSignedUp"; userId; email; timestamp }
  | { _tag: "UserViewedPage"; userId; page: "home" | "pricing" | "docs"; timestamp }
  | { _tag: "UserStartedTrial"; userId; plan; timestamp }
  | { _tag: "UserCompletedOnboarding"; userId; stepsCompleted: string[]; timestamp }
  | { _tag: "UserInvitedTeammate"; userId; inviteeEmail; timestamp }
  | { _tag: "UserConverted"; userId; plan; amount; timestamp }
  | { _tag: "UserChurned"; userId; reason?; timestamp }
```

These are **behavioral events** — things users actually do. Not "funnel events."

### Funnels as Code (Not Tables)

```typescript
interface Funnel {
  name: string
  // Given the user's event history, are they "in" this funnel?
  matches: (events: UserBehaviorEvent[]) => boolean
  // What to do when they enter
  onEnter?: (userId: UserId) => Effect<void, never, EmailService | SlackService>
  // What to do when they exit
  onExit?: (userId: UserId) => Effect<void, never, EmailService>
}
```

#### Example: Trial Nurture Funnel

```typescript
const TrialNurtureFunnel: Funnel = {
  name: "Trial Nurture",
  matches: (events) => {
    const startedTrial = events.some(e => e._tag === "UserStartedTrial")
    const converted = events.some(e => e._tag === "UserConverted")
    const churned = events.some(e => e._tag === "UserChurned")
    return startedTrial && !converted && !churned
  },
  onEnter: (userId) => sendEmail(userId, "Welcome to your trial!", "Here's how to get started..."),
  onExit: (userId) => Effect.void  // Silent exit
}
```

User is in this funnel if: they started a trial AND haven't converted AND haven't churned.

No `funnel_instances` row. No `current_stage` column. Just a predicate over events.

#### Example: Activation Funnel

```typescript
const ActivationFunnel: Funnel = {
  name: "Activation",
  matches: (events) => {
    const startedTrial = events.some(e => e._tag === "UserStartedTrial")
    const completedOnboarding = events.some(e => e._tag === "UserCompletedOnboarding")
    const invitedTeammate = events.some(e => e._tag === "UserInvitedTeammate")
    // In activation funnel until they've done BOTH onboarding AND invited someone
    return startedTrial && (!completedOnboarding || !invitedTeammate)
  },
  onEnter: (userId) => sendEmail(userId, "Let's get you activated", "Complete these steps..."),
  onExit: (userId) => notifySlack(`User ${userId} activated!`)
}
```

When they complete onboarding AND invite a teammate, they exit → Slack notification fires.

### The Reaction Loop

When any event is recorded, we compute funnel transitions:

```typescript
const reactToUserEvent = (newEvent: UserBehaviorEvent, allEvents: UserBehaviorEvent[]) =>
  Effect.gen(function* () {
    const eventsBefore = allEvents.slice(0, -1)  // Without the new event
    const eventsAfter = allEvents                 // With the new event

    // Compute which funnels user was in before vs after
    const wasFunnels = ALL_FUNNELS.filter(f => f.matches(eventsBefore))
    const nowFunnels = ALL_FUNNELS.filter(f => f.matches(eventsAfter))

    // Who did they exit?
    const exited = wasFunnels.filter(f => !nowFunnels.includes(f))
    // Who did they enter?
    const entered = nowFunnels.filter(f => !wasFunnels.includes(f))

    // Trigger exit hooks
    for (const funnel of exited) {
      if (funnel.onExit) yield* funnel.onExit(newEvent.userId)
    }

    // Trigger enter hooks
    for (const funnel of entered) {
      if (funnel.onEnter) yield* funnel.onEnter(newEvent.userId)
    }
  })
```

**One event can cause multiple funnel transitions.** `UserConverted` might exit "Trial Nurture" and enter "Customer Success" simultaneously.

### The Demo Story

```
1. User signs up
   → Event: UserSignedUp
   → Enters: "New User" funnel
   → Action: Welcome email

2. User starts trial
   → Event: UserStartedTrial
   → Exits: "New User" funnel
   → Enters: "Trial Nurture" funnel + "Activation" funnel
   → Actions: Trial welcome email + Activation checklist email

3. User completes onboarding
   → Event: UserCompletedOnboarding
   → Still in: "Trial Nurture" + "Activation" (need to also invite teammate)
   → Action: None (partial progress)

4. User invites teammate
   → Event: UserInvitedTeammate
   → Exits: "Activation" funnel (fully activated!)
   → Action: Slack notification "User activated!"

5. User converts
   → Event: UserConverted
   → Exits: "Trial Nurture" funnel
   → Enters: "Customer Success" funnel
   → Actions: Exit email from trial, welcome email as customer

6. Show: no funnel tables exist
   → SELECT * FROM funnel_instances → doesn't exist
   → SELECT * FROM events WHERE stream_id = 'user-123' → full history
   → Funnel membership? Compute it: TrialNurtureFunnel.matches(events)
```

---

## Why This Is Better

| Aspect | Three-Table ORM | Events + Computed Funnels |
|--------|-----------------|---------------------------|
| Source of truth | Mutable rows | Immutable events |
| Funnel membership | Stored in `funnel_instances` | Computed from events |
| History | Separate `_history` table, manually maintained | Events ARE history |
| "How did user get here?" | Query history, hope it's complete | Replay events |
| Schema evolution | Migrate live data | Add event types, old events unchanged |
| Add new funnel | New rows in `funnels`, update code | New predicate function |
| Debug "why in this funnel?" | Check `current_stage` column | Evaluate `matches(events)` |
| Multiple concurrent funnels | Complex: multiple `funnel_instances` rows | Natural: multiple predicates can match |
| Analytics | JOIN multiple tables | Query events directly |

### The Killer Features

**1. Time Travel**
```typescript
// What funnels was user in on March 15th?
const eventsAsOfMarch15 = events.filter(e => e.timestamp <= march15)
const funnelsThen = ALL_FUNNELS.filter(f => f.matches(eventsAsOfMarch15))
```

**2. Retroactive Funnel Definition**
```typescript
// "One might want to see who would have been in a 'High Intent' funnel last month"
const HighIntentFunnel: Funnel = {
  name: "High Intent",
  matches: (events) => events.filter(e => e._tag === "UserViewedPage" && e.page === "pricing").length >= 3
}

// Apply to historical data — no migration needed
users.map(u => ({ userId: u.id, wasHighIntent: HighIntentFunnel.matches(u.events) }))
```

**3. Testable Business Logic**
```typescript
// Pure function, no database
test("user enters trial nurture when starting trial", () => {
  const events = [
    { _tag: "UserSignedUp", ... },
    { _tag: "UserStartedTrial", ... }
  ]
  expect(TrialNurtureFunnel.matches(events)).toBe(true)
})
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EVENTS TABLE                                 │
│                (source of truth — append-only)                       │
├─────────────────────────────────────────────────────────────────────┤
│ stream_id  │ event_type            │ payload                │ ts    │
├────────────┼───────────────────────┼────────────────────────┼───────┤
│ user-123   │ UserSignedUp          │ {email: "..."}         │ ...   │
│ user-123   │ UserStartedTrial      │ {plan: "pro"}          │ ...   │
│ user-123   │ UserCompletedOnboard  │ {steps: [...]}         │ ...   │
│ user-123   │ UserInvitedTeammate   │ {invitee: "..."}       │ ...   │
│ user-123   │ UserConverted         │ {plan: "pro", $99}     │ ...   │
└─────────────────────────────────────────────────────────────────────┘
              │
              │  On each new event:
              │  1. Append to events table
              │  2. Compute funnel transitions
              │  3. Trigger enter/exit hooks
              │
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FUNNELS (code, not tables)                        │
├─────────────────────────────────────────────────────────────────────┤
│  TrialNurtureFunnel.matches(events) → boolean                        │
│  ActivationFunnel.matches(events) → boolean                          │
│  CustomerSuccessFunnel.matches(events) → boolean                     │
└─────────────────────────────────────────────────────────────────────┘
              │
              │  If the team needs tables for dashboards:
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 PROJECTIONS (derived, rebuildable)                   │
├─────────────────────────────────────────────────────────────────────┤
│  users (current state)                                               │
│  user_funnel_status (for dashboards — derived from events)           │
│  user_activity_log (for analytics — derived from events)             │
└─────────────────────────────────────────────────────────────────────┘
```

**If projections get corrupted:** Replay events, rebuild.
**If schema changes:** Rebuild projection, events unchanged.
**If one needs a new report:** Create new projection from existing events.

---

## Implementation Plan

| Task | Estimated Time |
|------|----------------|
| UserBehavior aggregate (events, minimal state) | 30 min |
| Funnel definitions as code (3-4 funnels) | 20 min |
| Reaction loop (compute transitions, trigger hooks) | 30 min |
| API: `POST /users/:id/events` (record behavioral event) | 20 min |
| API: `GET /users/:id/funnels` (show computed membership) | 15 min |
| Frontend: buttons to simulate user journey | 30 min |
| Demo: show no funnel tables, only events | 15 min |
| **Total** | ~2.5 hours |

---

## What This Demonstrates

1. **No `funnel_instances` table** — membership is `f.matches(events)`
2. **No `funnel_instance_data` table** — events ARE the history
3. **Funnels defined in code** — easy to add/modify, no schema migration
4. **Transitions are computed** — "entered Sales Funnel" derived from events
5. **Multiple actions per transition** — email + Slack + whatever
6. **Same tables if needed** — projections give you `SELECT * FROM user_funnel_status`
7. **Time travel for free** — "what funnel was user in last Tuesday?"
8. **Retroactive analysis** — define new funnel, apply to historical data

---

## Project Structure

```
event-triggers-poc/
├── docs/                           # Design documents and decisions
│   ├── 01-domain-and-behavior-summary.md
│   ├── 02-architecture-decisions.md
│   ├── 03-flows.md
│   ├── 04-api-design.md
│   ├── 05-event-sourcing-clarifications.md
│   ├── 06-hybrid-event-sourcing-approach.md
│   ├── 07-postgresql-event-sourcing-landscape.md
│   ├── 08-schema-evolution.md
│   └── side-thoughts/              # Extended analysis
├── backend-pure-es/                # Pure Event Sourcing implementation
│   ├── src/
│   │   ├── domain/                 # Aggregates (User, Address)
│   │   ├── reactions/              # Event handlers
│   │   ├── usecases/               # Business workflows
│   │   ├── infrastructure/         # Adapters (InMemory, Postgres, Email)
│   │   └── http/                   # API routes
│   └── test/                       # TDD tests
├── frontend/                       # React UI
└── README.md                       # This file
```

---

## Running the PoC

### Backend (Phase 1 - Address Triggers)

```bash
cd backend-pure-es
pnpm install
pnpm dev        # Start server on port 3000
pnpm test       # Run tests
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev        # Start on port 5173
```

### Demo Flow (Phase 1)

1. Create user: `POST /users`
2. Create address: `POST /users/:nickname/addresses` → Email sent!
3. Update city: `PATCH /users/:nickname/addresses/:label` → Different email sent!
4. Click revert link → Change undone, NO email (corrections are silent)

---

## The Bottom Line

> "You get your tables. They're projections over immutable events. If they break, we rebuild. If you need a new view, we derive it. Same SQL, different source of truth."

Events are facts. State is derived. Funnels are predicates. Tables are projections.
