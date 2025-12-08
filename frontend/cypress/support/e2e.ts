// =============================================================================
// Cypress E2E Support File
// =============================================================================
//
// This file runs before every spec file.
// Use it for:
// - Global configuration
// - Custom commands
// - Before/after hooks that apply to all tests
//

// Import Cypress commands (if we add custom ones later)
// import './commands'

// -----------------------------------------------------------------------------
// Global Before Each
// -----------------------------------------------------------------------------

beforeEach(() => {
  // Clear any localStorage between tests to ensure isolation
  cy.clearLocalStorage()
})

// -----------------------------------------------------------------------------
// Custom Commands (examples for future use)
// -----------------------------------------------------------------------------

// Example: cy.createUser({ email, firstName, lastName })
// Cypress.Commands.add('createUser', (user) => {
//   cy.request('POST', 'http://localhost:3000/users', user)
// })

// Declare types for custom commands
declare global {
  namespace Cypress {
    interface Chainable {
      // Add custom command types here
      // createUser(user: { email: string; firstName: string; lastName: string }): Chainable<void>
    }
  }
}

export {}
