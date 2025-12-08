// =============================================================================
// E2E Test: Address Change Flow
// =============================================================================
//
// WHAT WE TEST:
// The critical path through the PoC — create user, add address, update field.
// This proves frontend ↔ backend integration works end-to-end.
//
// WHAT WE DON'T TEST:
// The revert flow via email link. Why? The revert token is logged to console,
// which Cypress can't easily access. The revert mechanism is thoroughly tested
// in backend unit tests — no need to duplicate that coverage here.
//
// REQUIREMENTS:
// - Backend running on localhost:3000
// - Frontend running on localhost:5173
//

describe("Address Change Flow", () => {
  // Helper to generate unique user data per test
  const makeTestUser = () => {
    const id = Date.now() + Math.random().toString(36).slice(2, 8)
    return {
      email: `test-${id}@example.com`,
      firstName: "Test",
      lastName: `User${id}`,
      expectedNickname: `test-user${id}`,
    }
  }

  beforeEach(() => {
    // Each test starts fresh — visit the home page
    cy.visit("/")
  })

  // ---------------------------------------------------------------------------
  // Test 1: Create User
  // ---------------------------------------------------------------------------
  it("creates a new user and redirects to profile", () => {
    const user = makeTestUser()

    // Fill in the form
    cy.get('input[type="email"]').clear().type(user.email)
    cy.get('input[type="text"]').eq(0).clear().type(user.firstName)
    cy.get('input[type="text"]').eq(1).clear().type(user.lastName)

    // Submit
    cy.contains("button", "Create User").click()

    // Should redirect to /users/:nickname
    cy.url().should("include", `/users/${user.expectedNickname}`)

    // Should show the user's name
    cy.contains("h1", `${user.firstName} ${user.lastName}`)
  })

  // ---------------------------------------------------------------------------
  // Test 2: Full Flow — Create User → Add Address → Update Field
  // ---------------------------------------------------------------------------
  it("completes the full address change flow", () => {
    const user = makeTestUser()

    // --- Step 1: Create User ---
    cy.get('input[type="email"]').clear().type(user.email)
    cy.get('input[type="text"]').eq(0).clear().type(user.firstName)
    cy.get('input[type="text"]').eq(1).clear().type(user.lastName)
    cy.contains("button", "Create User").click()

    // Wait for redirect
    cy.url().should("include", `/users/${user.expectedNickname}`)

    // --- Step 2: Add Address ---
    cy.contains("button", "+ Add Address").click()

    // Fill in address form (using default values from the form)
    // The form has pre-filled values, so we just need to submit
    // But let's be explicit for clarity
    cy.get('input[value="home"]').should("exist") // label field has default "home"
    cy.contains("button", "Add Address").click()

    // Should see the address card appear
    cy.contains(".address-label", "home").should("exist")

    // Should see a toast about email
    cy.contains("check console for email").should("exist")

    // --- Step 3: Update City Field ---
    // Find the city row and click edit
    cy.contains(".field-label", "City")
      .parent()
      .find("button.btn-edit")
      .click()

    // Clear and type new value
    cy.get(".field-edit input").clear().type("Lyon")

    // Save
    cy.get(".field-edit .btn-save").click()

    // Should see toast about the update
    cy.contains("city updated").should("exist")
    cy.contains("check console").should("exist")

    // The field should now show "Lyon"
    cy.contains(".field-label", "City")
      .parent()
      .contains("Lyon")
      .should("exist")
  })

  // ---------------------------------------------------------------------------
  // Test 3: Quick Access by Nickname
  // ---------------------------------------------------------------------------
  it("can access existing user by nickname", () => {
    const user = makeTestUser()

    // First create a user
    cy.get('input[type="email"]').clear().type(user.email)
    cy.get('input[type="text"]').eq(0).clear().type(user.firstName)
    cy.get('input[type="text"]').eq(1).clear().type(user.lastName)
    cy.contains("button", "Create User").click()
    cy.url().should("include", `/users/${user.expectedNickname}`)

    // Go back to home
    cy.visit("/")

    // Use the "Access Existing User" form
    cy.get('input[placeholder*="jean-dupont"]').type(user.expectedNickname)
    cy.contains("button", "Go to Profile").click()

    // Should be on the profile page
    cy.url().should("include", `/users/${user.expectedNickname}`)
    cy.contains("h1", `${user.firstName} ${user.lastName}`)
  })

  // ---------------------------------------------------------------------------
  // Test 4: Unknown User Shows Error
  // ---------------------------------------------------------------------------
  it("shows error for unknown user", () => {
    // Navigate directly to a non-existent user
    cy.visit("/users/nonexistent-user-12345")

    // Should show "not found" message
    cy.contains("User Not Found").should("exist")
  })
})
