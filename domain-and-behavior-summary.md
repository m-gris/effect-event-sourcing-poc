# Domain & Behavior Summary

## Purpose

This document captures the business domain and expected behaviors for the Event Triggers PoC, independent of any technical implementation choices.

---

## The Domain

### User

A **User** has:
- A first name
- A last name
- Zero or more **Addresses**

### Address

An **Address** has:
- Label (required, e.g., "Home", "Work")
- Street number
- Street name
- Zip Code
- City
- Country

All fields are required when creating an address.

---

## Behaviors

### 1. Profile Viewing

A user can view their personal information (name) and all their addresses.

### 2. Profile Editing

A user can edit their first name, last name, and any of their addresses.

### 3. Address Actions Trigger Safety Emails

Whenever a user **creates, modifies, or deletes an address**, the system:
1. **Applies the change immediately** — the new state becomes the current truth
2. **Sends a safety email** — "Was this you? If not, click to revert"

| Action | Email | Revert behavior |
|--------|-------|-----------------|
| Create address | 1 email | Deletes the address |
| Edit address field | 1 email per field | Restores old value |
| Delete address | 1 email | Restores the address |

Editing first name or last name does **not** trigger any email.

### 4. Email Content Varies by Action/Field

The safety email content depends on the action type and, for edits, which specific field was modified:

| Action / Field Changed | Email Type |
|------------------------|------------|
| Address created | Email: Create |
| Address deleted | Email: Delete |
| Label changed | Email: Label |
| Street number changed | Email: Street Number |
| Street name changed | Email: Street Name |
| Zip code changed | Email: Zip Code |
| City changed | Email: City |
| Country changed | Email: Country |

*(Exact email content TBD — the variation demonstrates that different actions trigger different emails)*

### 5. Revert Mechanism

The email contains a **revert link**:

- Email displays the change that occurred (field, old value → new value)
- Email contains **one clickable link**: `/revert/:token`
- Clicking the link restores the old value and returns a simple response ("Reverted!")
- **Link is one-time use** — once clicked, subsequent clicks return "already processed" or similar
- The token identifies the event in the event log; the old value is recovered from history (not stored in the token)

### 6. No Pending State

Unlike approval-gated workflows, there is **no pending state**:

- Change applies immediately
- User sees the new value right away
- Email is a safety net, not a gate
- User can continue editing freely

### 7. Email via Ethereal (Test SMTP)

Messages are sent as real emails via [Ethereal](https://ethereal.email/) — a fake SMTP service that captures emails without delivering them. This avoids building an inbox UI while still demonstrating the full trigger-to-notification flow.

---

## Constraints / Simplifications

1. **Single-field edits only**: Only one field of one address can be updated at a time. No bulk edits, no multi-field updates in a single action.
   - *Rationale: Avoids combinatorial complexity — no need to decide what email to send when multiple fields change simultaneously.*

2. **Single-field edits enforced by UI**: The UI only allows editing one field at a time (edit icon per field, others locked while editing).

3. **Single user, no authentication**: The PoC assumes a single user with no login or identity management.
   - *Rationale (PoC simplification): User identity doesn't fundamentally change the event-trigger mechanism being demonstrated.*

---

## Out of Scope / Known Limitations

1. **Revert after subsequent edit**: If a field is modified again after an email was sent, the behavior of the original revert link is undefined.
   - *Rationale (PoC simplification): Handling stale reverts adds complexity (conflict detection, merge logic) orthogonal to the core event-trigger mechanism.*

2. **Revert link expiry**: Revert links do not expire. They remain valid indefinitely (until used).
   - *Rationale (PoC simplification): Expiry would require background jobs and timestamp logic.*

---

## Open Questions

*(None at this time — all behavioral questions resolved.)*

---

## Notes

- **Multiple message types exist to demonstrate routing complexity**, not because the content matters. The PoC goal is showing that different field changes trigger different actions.
