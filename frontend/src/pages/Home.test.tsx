// =============================================================================
// Home Component Tests — Minimal Effective Dose
// =============================================================================
//
// What we're testing:
// 1. Component renders the form
// 2. Form submission calls API and navigates on success
// 3. Error state is displayed when API fails
//
// What we're NOT testing:
// - CSS styling
// - Exact DOM structure
// - Implementation details (internal state)
//
// Philosophy: Test behavior, not implementation.
//
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../test/utils'
import userEvent from '@testing-library/user-event'
import { Home } from './Home'

// Mock the API module
vi.mock('../api', () => ({
  createUser: vi.fn()
}))

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

// Import after mocking so we get the mocked version
import * as api from '../api'

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the create user form', () => {
    render(<Home />)

    expect(screen.getByRole('heading', { name: /event triggers poc/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument()
  })

  it('navigates to profile on successful user creation', async () => {
    const user = userEvent.setup()

    // Mock successful API response
    vi.mocked(api.createUser).mockResolvedValueOnce({
      nickname: 'jean-dupont',
      email: 'jean.dupont@example.com',
      firstName: 'Jean',
      lastName: 'Dupont'
    })

    render(<Home />)

    // Form has default values, just click submit
    await user.click(screen.getByRole('button', { name: /create user/i }))

    // Verify API was called with form data
    expect(api.createUser).toHaveBeenCalledWith({
      email: 'jean.dupont@example.com',
      firstName: 'Jean',
      lastName: 'Dupont'
    })

    // Verify navigation to profile
    expect(mockNavigate).toHaveBeenCalledWith('/users/jean-dupont')
  })

  it('displays error message when API fails', async () => {
    const user = userEvent.setup()

    // Mock API failure
    vi.mocked(api.createUser).mockRejectedValueOnce({
      _tag: 'UserAlreadyExists',
      message: 'User already exists'
    })

    render(<Home />)

    await user.click(screen.getByRole('button', { name: /create user/i }))

    // Error should be displayed
    expect(await screen.findByText(/user already exists/i)).toBeInTheDocument()
  })

  it('navigates to profile via quick access form', async () => {
    const user = userEvent.setup()

    render(<Home />)

    // Find the quick access input and enter a nickname
    const nicknameInput = screen.getByPlaceholderText(/jean-dupont/i)
    await user.type(nicknameInput, 'marie-curie')

    // Submit the form
    await user.click(screen.getByRole('button', { name: /go to profile/i }))

    // Verify navigation
    expect(mockNavigate).toHaveBeenCalledWith('/users/marie-curie')
  })

  it('disables submit button while loading', async () => {
    const user = userEvent.setup()

    // Mock API that never resolves (simulates loading)
    vi.mocked(api.createUser).mockImplementation(() => new Promise(() => {}))

    render(<Home />)

    const submitButton = screen.getByRole('button', { name: /create user/i })
    await user.click(submitButton)

    // Button should show loading state
    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled()
  })
})
