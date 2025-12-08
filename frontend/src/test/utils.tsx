// =============================================================================
// Test Utilities — Render with Router
// =============================================================================
//
// Components using react-router-dom hooks (useNavigate, useParams) need
// to be wrapped in a Router. This helper does that.
//
import { render, type RenderOptions } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import type { ReactElement, ReactNode } from 'react'

// Wrapper that provides routing context
function AllProviders({ children }: { children: ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>
}

// Custom render that wraps component with providers
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

// Re-export everything from testing-library
export * from '@testing-library/react'

// Override render with our custom version
export { customRender as render }
