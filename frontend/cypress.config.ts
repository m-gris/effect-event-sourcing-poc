import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    // Base URL for the frontend dev server
    baseUrl: "http://localhost:5173",

    // Where to find spec files
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",

    // Support file (runs before each spec)
    supportFile: "cypress/support/e2e.ts",

    // Viewport size
    viewportWidth: 1280,
    viewportHeight: 720,

    // Video recording (disable for faster runs)
    video: false,

    // Screenshots on failure
    screenshotOnRunFailure: true,

    // Timeouts
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
  },
});
