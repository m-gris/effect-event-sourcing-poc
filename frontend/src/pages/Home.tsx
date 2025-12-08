import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api'
import './Home.css'

export function Home() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create user form
  const [userForm, setUserForm] = useState({
    email: 'jean.dupont@example.com',
    firstName: 'Jean',
    lastName: 'Dupont'
  })

  // Quick access nickname
  const [quickNickname, setQuickNickname] = useState('')

  const handleCreateUser = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.createUser(userForm)
      navigate(`/users/${result.nickname}`)
    } catch (e: unknown) {
      const err = e as api.ApiError
      setError(err.message || 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickAccess = (e: React.FormEvent) => {
    e.preventDefault()
    if (quickNickname.trim()) {
      navigate(`/users/${quickNickname.trim()}`)
    }
  }

  return (
    <div className="home-container">
      <div className="home-header">
        <h1>Event Triggers PoC</h1>
        <p className="subtitle">Demonstrating event-sourced address changes with field-specific emails</p>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="home-sections">
        {/* Create New User */}
        <div className="card">
          <h2>Create New User</h2>
          <div className="form">
            <label>
              Email
              <input
                type="email"
                value={userForm.email}
                onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label>
              First Name
              <input
                type="text"
                value={userForm.firstName}
                onChange={e => setUserForm(f => ({ ...f, firstName: e.target.value }))}
              />
            </label>
            <label>
              Last Name
              <input
                type="text"
                value={userForm.lastName}
                onChange={e => setUserForm(f => ({ ...f, lastName: e.target.value }))}
              />
            </label>
            <button onClick={handleCreateUser} disabled={loading}>
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </div>

        {/* Quick Access */}
        <div className="card">
          <h2>Access Existing User</h2>
          <form onSubmit={handleQuickAccess} className="form">
            <label>
              Nickname
              <input
                type="text"
                value={quickNickname}
                onChange={e => setQuickNickname(e.target.value)}
                placeholder="e.g. jean-dupont"
              />
            </label>
            <button type="submit" disabled={!quickNickname.trim()}>
              Go to Profile
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
