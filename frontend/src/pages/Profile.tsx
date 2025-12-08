import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api'
import './Profile.css'

// localStorage key for persisting nickname across page reloads
const NICKNAME_STORAGE_KEY = 'poc_user_nickname'

// =============================================================================
// Types
// =============================================================================

interface User {
  nickname: string
  email: string
  firstName: string
  lastName: string
}

interface Address {
  label: string
  streetNumber: string
  streetName: string
  zipCode: string
  city: string
  country: string
}

type AddressField = 'streetNumber' | 'streetName' | 'zipCode' | 'city' | 'country'

interface EditingState {
  addressLabel: string
  field: AddressField
  value: string
}

// =============================================================================
// Profile Component
// =============================================================================

export function Profile() {
  // User state
  const [user, setUser] = useState<User | null>(null)
  const [addresses, setAddresses] = useState<Address[]>([])

  // UI state
  const [initialLoading, setInitialLoading] = useState(true) // Loading on mount
  const [loading, setLoading] = useState(false) // Loading for actions
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [showAddAddress, setShowAddAddress] = useState(false)
  const [revertToken, setRevertToken] = useState('')
  const [showRevertModal, setShowRevertModal] = useState(false)

  // ---------------------------------------------------------------------------
  // Load user on mount if nickname in localStorage
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const savedNickname = localStorage.getItem(NICKNAME_STORAGE_KEY)
    if (!savedNickname) {
      setInitialLoading(false)
      return
    }

    api.getUser(savedNickname)
      .then(result => {
        setUser({
          nickname: savedNickname,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName
        })
        setAddresses(result.addresses)
      })
      .catch(() => {
        // User doesn't exist anymore (or backend restarted), clear localStorage
        localStorage.removeItem(NICKNAME_STORAGE_KEY)
      })
      .finally(() => {
        setInitialLoading(false)
      })
  }, [])

  // Create user form (shown when no user exists)
  const [userForm, setUserForm] = useState({
    email: 'jean.dupont@example.com',
    firstName: 'Jean',
    lastName: 'Dupont'
  })

  // Add address form
  const [addressForm, setAddressForm] = useState({
    label: 'home',
    streetNumber: '42',
    streetName: 'Rue de Rivoli',
    zipCode: '75001',
    city: 'Paris',
    country: 'France'
  })

  // -----------------------------------------------------------------------------
  // Toast helper
  // -----------------------------------------------------------------------------
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  // -----------------------------------------------------------------------------
  // Create User
  // -----------------------------------------------------------------------------
  const handleCreateUser = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.createUser(userForm)
      // Save nickname to localStorage for persistence across reloads
      localStorage.setItem(NICKNAME_STORAGE_KEY, result.nickname)
      setUser(result)
      showToast(`Welcome, ${result.firstName}!`)
    } catch (e: unknown) {
      const err = e as api.ApiError
      setError(err.message || 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  // -----------------------------------------------------------------------------
  // Add Address
  // -----------------------------------------------------------------------------
  const handleAddAddress = async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.createAddress(user.nickname, addressForm)
      setAddresses(prev => [...prev, result])
      setShowAddAddress(false)
      showToast(`Address "${result.label}" created — check console for email!`)
      // Reset form for next address
      setAddressForm(f => ({ ...f, label: `address-${addresses.length + 2}` }))
    } catch (e: unknown) {
      const err = e as api.ApiError
      setError(err.message || 'Failed to add address')
    } finally {
      setLoading(false)
    }
  }

  // -----------------------------------------------------------------------------
  // Edit Address Field
  // -----------------------------------------------------------------------------
  const startEditing = (address: Address, field: AddressField) => {
    setEditing({
      addressLabel: address.label,
      field,
      value: address[field]
    })
  }

  const cancelEditing = () => {
    setEditing(null)
  }

  const saveEdit = async () => {
    if (!user || !editing) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.updateAddressField(user.nickname, editing.addressLabel, {
        field: editing.field,
        value: editing.value
      })
      // Update local state
      setAddresses(prev => prev.map(addr =>
        addr.label === editing.addressLabel
          ? { ...addr, [editing.field]: editing.value }
          : addr
      ))
      setEditing(null)
      showToast(`${editing.field} updated: "${result.oldValue}" → "${result.newValue}" — check console!`)
    } catch (e: unknown) {
      const err = e as api.ApiError
      setError(err.message || 'Failed to update field')
    } finally {
      setLoading(false)
    }
  }

  // -----------------------------------------------------------------------------
  // Revert Change
  // -----------------------------------------------------------------------------
  const handleRevert = async () => {
    if (!revertToken.trim()) return
    setLoading(true)
    setError(null)
    try {
      await api.revertChange(revertToken)
      setShowRevertModal(false)
      setRevertToken('')
      showToast('Change reverted — NO email sent! (corrections are silent)')
    } catch (e: unknown) {
      const err = e as api.ApiError
      setError(err.message || 'Failed to revert')
    } finally {
      setLoading(false)
    }
  }

  // -----------------------------------------------------------------------------
  // Field label helper
  // -----------------------------------------------------------------------------
  const fieldLabels: Record<AddressField, string> = {
    streetNumber: 'Street #',
    streetName: 'Street',
    zipCode: 'Zip',
    city: 'City',
    country: 'Country'
  }

  // -----------------------------------------------------------------------------
  // Render: Initial loading
  // -----------------------------------------------------------------------------
  if (initialLoading) {
    return (
      <div className="profile-container">
        <div className="profile-header">
          <h1>Loading...</h1>
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------------------
  // Render: No user yet
  // -----------------------------------------------------------------------------
  if (!user) {
    return (
      <div className="profile-container">
        <div className="profile-header">
          <h1>Create Your Profile</h1>
          <p className="subtitle">
            <Link to="/demo">Switch to Demo Funnel</Link>
          </p>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="card">
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
              {loading ? 'Creating...' : 'Create Profile'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------------------
  // Render: Profile view
  // -----------------------------------------------------------------------------
  return (
    <div className="profile-container">
      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}

      {/* Header */}
      <div className="profile-header">
        <div className="avatar">{user.firstName[0]}{user.lastName[0]}</div>
        <div className="user-info">
          <h1>{user.firstName} {user.lastName}</h1>
          <p className="email">{user.email}</p>
        </div>
        <Link to="/demo" className="switch-link">Demo Funnel →</Link>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Addresses Section */}
      <section className="addresses-section">
        <div className="section-header">
          <h2>Addresses</h2>
          <button className="btn-secondary" onClick={() => setShowRevertModal(true)}>
            Revert a Change
          </button>
        </div>

        {addresses.length === 0 && !showAddAddress && (
          <p className="empty-state">No addresses yet. Add one below.</p>
        )}

        {addresses.map(address => (
          <div key={address.label} className="address-card">
            <div className="address-label">
              <span className="label-icon">📍</span>
              {address.label}
            </div>
            <div className="address-fields">
              {(['streetNumber', 'streetName', 'zipCode', 'city', 'country'] as AddressField[]).map(field => (
                <div key={field} className="field-row">
                  <span className="field-label">{fieldLabels[field]}</span>
                  {editing?.addressLabel === address.label && editing.field === field ? (
                    <div className="field-edit">
                      <input
                        type="text"
                        value={editing.value}
                        onChange={e => setEditing({ ...editing, value: e.target.value })}
                        autoFocus
                      />
                      <button className="btn-save" onClick={saveEdit} disabled={loading}>
                        {loading ? '...' : '✓'}
                      </button>
                      <button className="btn-cancel" onClick={cancelEditing}>✕</button>
                    </div>
                  ) : (
                    <div className="field-value">
                      <span>{address[field]}</span>
                      <button
                        className="btn-edit"
                        onClick={() => startEditing(address, field)}
                        title={`Edit ${fieldLabels[field]}`}
                      >
                        ✏️
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Add Address Form */}
        {showAddAddress ? (
          <div className="card add-address-form">
            <h3>New Address</h3>
            <div className="form">
              <label>
                Label
                <input
                  type="text"
                  value={addressForm.label}
                  onChange={e => setAddressForm(f => ({ ...f, label: e.target.value }))}
                />
              </label>
              <div className="form-row">
                <label>
                  Street #
                  <input
                    type="text"
                    value={addressForm.streetNumber}
                    onChange={e => setAddressForm(f => ({ ...f, streetNumber: e.target.value }))}
                  />
                </label>
                <label className="flex-grow">
                  Street Name
                  <input
                    type="text"
                    value={addressForm.streetName}
                    onChange={e => setAddressForm(f => ({ ...f, streetName: e.target.value }))}
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Zip Code
                  <input
                    type="text"
                    value={addressForm.zipCode}
                    onChange={e => setAddressForm(f => ({ ...f, zipCode: e.target.value }))}
                  />
                </label>
                <label className="flex-grow">
                  City
                  <input
                    type="text"
                    value={addressForm.city}
                    onChange={e => setAddressForm(f => ({ ...f, city: e.target.value }))}
                  />
                </label>
              </div>
              <label>
                Country
                <input
                  type="text"
                  value={addressForm.country}
                  onChange={e => setAddressForm(f => ({ ...f, country: e.target.value }))}
                />
              </label>
              <div className="form-actions">
                <button onClick={handleAddAddress} disabled={loading}>
                  {loading ? 'Adding...' : 'Add Address'}
                </button>
                <button className="btn-secondary" onClick={() => setShowAddAddress(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button className="btn-add-address" onClick={() => setShowAddAddress(true)}>
            + Add Address
          </button>
        )}
      </section>

      {/* Revert Modal */}
      {showRevertModal && (
        <div className="modal-overlay" onClick={() => setShowRevertModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Revert a Change</h3>
            <p>Paste the revert token from the email (shown in backend console).</p>
            <input
              type="text"
              value={revertToken}
              onChange={e => setRevertToken(e.target.value)}
              placeholder="Revert token"
            />
            <div className="modal-actions">
              <button onClick={handleRevert} disabled={loading || !revertToken.trim()}>
                {loading ? 'Reverting...' : 'Revert'}
              </button>
              <button className="btn-secondary" onClick={() => setShowRevertModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
