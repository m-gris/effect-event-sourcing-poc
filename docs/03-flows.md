# Sequence Flows

This document describes the key user flows and system interactions for the Event Triggers PoC.

---

## Flow 0: First-Time User / Profile Creation

**Starting point:** User arrives on a blank page. No profile, no addresses.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Sees empty form (email, first name, last name fields) and "Add address" button |
| 2 | User | Fills in email, first name and last name, clicks Save |
| 3 | Frontend | Sends command to backend: create user profile |
| 4 | Backend | Validates: email valid, first name and last name non-empty |
| 5 | Backend | Persists event: `UserCreated` |
| 6 | Backend | Returns success |
| 7 | Frontend | Displays saved profile |

**No email triggered** — profile creation doesn't trigger emails (but email is stored for future notifications).

---

## Flow 1: Creating an Address

**Starting point:** User has a profile. No addresses yet (or wants to add another).

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Clicks "Add address" button |
| 2 | Frontend | Shows inline form with 6 required fields: label, street number, street name, zip code, city, country |
| 3 | User | Fills in all fields, clicks Save |
| 4 | Frontend | Sends command to backend: create address (includes userId) |
| 5 | Backend | API layer validates: user exists, label is unique for this user |
| 6 | Backend | Persists event: `AddressCreated` (carries userId and all field values) |
| 7 | Backend | Generates revert token for this event |
| 8 | Backend | Sends email: "Address '[label]' was created. Not you? Click to revert." |
| 9 | Backend | Returns success + new address data |
| 10 | Frontend | Displays the new address in the list |

**Email triggered:** 1 email for the whole address creation.

**Revert behavior:** Deletes the address entirely.

---

## Flow 2: Editing an Address Field

**Starting point:** User has an address with city = "Paris".

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Clicks edit icon next to "City" field |
| 2 | Frontend | Makes city field editable; other fields remain locked |
| 3 | User | Changes value from "Paris" to "Lyon", clicks Save |
| 4 | Frontend | Sends command to backend: update field (addressId, field, newValue) |
| 5 | Backend | If label change: API layer validates label uniqueness for this user |
| 6 | Backend | Folds events → current state; determines old value |
| 7 | Backend | Persists event: `AddressFieldChanged` (field, from, to) |
| 8 | Backend | Generates revert token for this event |
| 9 | Backend | Sends field-specific email: "Your city was changed from Paris to Lyon. Not you? Click to revert." |
| 10 | Backend | Returns success + updated address data |
| 11 | Frontend | Displays "Lyon" as the new city value |

**Email triggered:** 1 field-specific email.

**Revert behavior:** Restores old value ("Paris").

### Email Varies by Field

Each field change triggers a distinct email type (content varies by field). Exact wording TBD — the variation demonstrates that different fields trigger different emails.

---

## Flow 3: Deleting an Address

**Starting point:** User has an address labeled "Home".

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Clicks delete button on the address |
| 2 | Frontend | Sends command to backend: delete address (addressId) |
| 3 | Backend | Folds events → current state (to capture snapshot for restore) |
| 4 | Backend | Persists event: `AddressDeleted` (includes snapshot of all field values) |
| 5 | Backend | Generates revert token for this event |
| 6 | Backend | Sends email: "Address 'Home' was deleted. Not you? Click to restore." |
| 7 | Backend | Returns success |
| 8 | Frontend | Removes the address from the list |

**Email triggered:** 1 email for the deletion.

**Revert behavior:** Restores the address with all its field values (from snapshot in event).

---

## Flow 4: Clicking the Revert Link

**Starting point:** User received an email with a revert link.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Opens email in Ethereal (test inbox) |
| 2 | User | Clicks the revert link: `GET /revert/:token` |
| 3 | Backend | Looks up token → finds the original event |
| 4 | Backend | Persists revert event (e.g., `CityReverted`, `AddressRestored`, or `CreationReverted`) |
| 5 | Backend | Marks token as used |
| 6 | Backend | Returns confirmation page: "Reverted! [description of what was undone]" |

### Revert by Original Action

| Original Action | Revert Event | Result |
|-----------------|--------------|--------|
| AddressCreated | CreationReverted | Address removed |
| *Changed (e.g., CityChanged) | *Reverted (e.g., CityReverted) | Field restored to old value |
| AddressDeleted | AddressRestored | Address reappears with original values |

---

## Flow 5: Revert Link Error Cases

### Invalid Token

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Clicks a malformed or non-existent token link |
| 2 | Backend | Token lookup fails |
| 3 | Backend | Returns error page: "Invalid link" (404) |

### Already Used Token

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Clicks a revert link they already used |
| 2 | Backend | Token found but marked as used |
| 3 | Backend | Returns info page: "This change was already reverted." |

---

## Flow 6: Editing First Name / Last Name

**Starting point:** User has a profile with first name = "Jean".

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Edits first name to "Jean-Pierre", clicks Save |
| 2 | Frontend | Sends command to backend: update name (userId, field, newValue) |
| 3 | Backend | Validates: new value non-empty |
| 4 | Backend | Persists event: `UserNameChanged` (field, from, to) |
| 5 | Backend | Returns success |
| 6 | Frontend | Displays "Jean-Pierre" |

**No email triggered** — name fields don't trigger emails.

---

## Summary: What Triggers Emails

| Action | Email? | Count |
|--------|--------|-------|
| Edit first name | No | — |
| Edit last name | No | — |
| Create address | Yes | 1 |
| Edit address field | Yes | 1 per field |
| Delete address | Yes | 1 |
