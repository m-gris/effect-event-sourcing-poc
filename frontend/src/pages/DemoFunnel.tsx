import { useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api'
import './DemoFunnel.css'

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

type Step = 'create-user' | 'create-address' | 'update-address' | 'revert'

// =============================================================================
// DemoFunnel Component
// =============================================================================

export function DemoFunnel() {
  // Current step in the demo flow
  const [step, setStep] = useState<Step>('create-user')

  // Created data
  const [user, setUser] = useState<User | null>(null)
  const [address, setAddress] = useState<Address | null>(null)

  // Form states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // -----------------------------------------------------------------------------
  // Create User
  // -----------------------------------------------------------------------------
  const [userForm, setUserForm] = useState({
    email: 'jean.dupont@example.com',
    firstName: 'Jean',
    lastName: 'Dupont'
  })

  const handleCreateUser = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.createUser(userForm)
      setUser(result)
      setMessage(`User created: ${result.nickname}`)
      setStep('create-address')
    } catch (e: unknown) {
      const err = e as api.ApiError
      setError(err.message || 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  // -----------------------------------------------------------------------------
  // Create Address
  // -----------------------------------------------------------------------------
  const [addressForm, setAddressForm] = useState({
    label: 'home',
    streetNumber: '42',
    streetName: 'Rue de Rivoli',
    zipCode: '75001',
    city: 'Paris',
    country: 'France'
  })

  const handleCreateAddress = async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.createAddress(user.nickname, addressForm)
      setAddress(result)
      setMessage(`Address created: ${result.label} - Check console for email!`)
      setStep('update-address')
    } catch (e: unknown) {
      const err = e as api.ApiError
      setError(err.message || 'Failed to create address')
    } finally {
      setLoading(false)
    }
  }

  // -----------------------------------------------------------------------------
  // Update Address Field
  // -----------------------------------------------------------------------------
  const [updateField, setUpdateField] = useState<api.UpdateAddressFieldRequest['field']>('city')
  const [updateValue, setUpdateValue] = useState('Lyon')

  const handleUpdateField = async () => {
    if (!user || !address) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.updateAddressField(user.nickname, address.label, {
        field: updateField,
        value: updateValue
      })
      setMessage(`Field updated: ${result.field} changed from "${result.oldValue}" to "${result.newValue}" - Check console for FIELD-SPECIFIC email!`)
      setAddress(prev => prev ? { ...prev, [updateField]: updateValue } : null)
      setStep('revert')
    } catch (e: unknown) {
      const err = e as api.ApiError
      setError(err.message || 'Failed to update address')
    } finally {
      setLoading(false)
    }
  }

  // -----------------------------------------------------------------------------
  // Revert Change
  // -----------------------------------------------------------------------------
  const [revertToken, setRevertToken] = useState('')

  const handleRevert = async () => {
    if (!revertToken) {
      setError('Please enter the revert token from the console email')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await api.revertChange(revertToken)
      setMessage(`${result.message} - Check console: NO EMAIL SENT! (corrections are silent)`)
    } catch (e: unknown) {
      const err = e as api.ApiError
      setError(err.message || 'Failed to revert change')
    } finally {
      setLoading(false)
    }
  }

  // -----------------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------------
  return (
    <div className="container">
      <h1>Event Triggers PoC</h1>
      <p className="subtitle">
        Step-by-step demo — <Link to="/profile">Switch to Profile View</Link>
      </p>

      {/* Status Messages */}
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      {/* Progress Indicator */}
      <div className="progress">
        <span className={step === 'create-user' ? 'active' : user ? 'done' : ''}>1. Create User</span>
        <span className={step === 'create-address' ? 'active' : address ? 'done' : ''}>2. Create Address</span>
        <span className={step === 'update-address' ? 'active' : step === 'revert' ? 'done' : ''}>3. Update Field</span>
        <span className={step === 'revert' ? 'active' : ''}>4. Revert</span>
      </div>

      {/* Step 1: Create User */}
      {step === 'create-user' && (
        <div className="card">
          <h2>Step 1: Create User</h2>
          <div className="form">
            <label>
              Email:
              <input
                type="email"
                value={userForm.email}
                onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label>
              First Name:
              <input
                type="text"
                value={userForm.firstName}
                onChange={e => setUserForm(f => ({ ...f, firstName: e.target.value }))}
              />
            </label>
            <label>
              Last Name:
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
      )}

      {/* Step 2: Create Address */}
      {step === 'create-address' && user && (
        <div className="card">
          <h2>Step 2: Create Address for {user.nickname}</h2>
          <p className="hint">This will trigger an email (check console)</p>
          <div className="form">
            <label>
              Label:
              <input
                type="text"
                value={addressForm.label}
                onChange={e => setAddressForm(f => ({ ...f, label: e.target.value }))}
              />
            </label>
            <label>
              Street Number:
              <input
                type="text"
                value={addressForm.streetNumber}
                onChange={e => setAddressForm(f => ({ ...f, streetNumber: e.target.value }))}
              />
            </label>
            <label>
              Street Name:
              <input
                type="text"
                value={addressForm.streetName}
                onChange={e => setAddressForm(f => ({ ...f, streetName: e.target.value }))}
              />
            </label>
            <label>
              Zip Code:
              <input
                type="text"
                value={addressForm.zipCode}
                onChange={e => setAddressForm(f => ({ ...f, zipCode: e.target.value }))}
              />
            </label>
            <label>
              City:
              <input
                type="text"
                value={addressForm.city}
                onChange={e => setAddressForm(f => ({ ...f, city: e.target.value }))}
              />
            </label>
            <label>
              Country:
              <input
                type="text"
                value={addressForm.country}
                onChange={e => setAddressForm(f => ({ ...f, country: e.target.value }))}
              />
            </label>
            <button onClick={handleCreateAddress} disabled={loading}>
              {loading ? 'Creating...' : 'Create Address'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Update Address Field */}
      {step === 'update-address' && user && address && (
        <div className="card">
          <h2>Step 3: Update Address Field</h2>
          <p className="hint">This will trigger a FIELD-SPECIFIC email (check console)</p>
          <div className="current-address">
            <strong>Current Address ({address.label}):</strong>
            <br />
            {address.streetNumber} {address.streetName}, {address.zipCode} {address.city}, {address.country}
          </div>
          <div className="form">
            <label>
              Field to update:
              <select
                value={updateField}
                onChange={e => setUpdateField(e.target.value as api.UpdateAddressFieldRequest['field'])}
              >
                <option value="streetNumber">Street Number</option>
                <option value="streetName">Street Name</option>
                <option value="zipCode">Zip Code</option>
                <option value="city">City</option>
                <option value="country">Country</option>
              </select>
            </label>
            <label>
              New value:
              <input
                type="text"
                value={updateValue}
                onChange={e => setUpdateValue(e.target.value)}
              />
            </label>
            <button onClick={handleUpdateField} disabled={loading}>
              {loading ? 'Updating...' : `Update ${updateField}`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Revert Change */}
      {step === 'revert' && (
        <div className="card">
          <h2>Step 4: Revert Change</h2>
          <p className="hint">Copy the revert token from the console email and paste it here.</p>
          <p className="hint"><strong>THE KEY INSIGHT:</strong> After reverting, NO email will be sent!</p>
          <div className="form">
            <label>
              Revert Token:
              <input
                type="text"
                value={revertToken}
                onChange={e => setRevertToken(e.target.value)}
                placeholder="Paste token from console email"
              />
            </label>
            <button onClick={handleRevert} disabled={loading || !revertToken}>
              {loading ? 'Reverting...' : 'Revert Change (watch console - NO email!)'}
            </button>
          </div>
        </div>
      )}

      {/* Reset */}
      {(user || address) && (
        <button
          className="reset"
          onClick={() => {
            setUser(null)
            setAddress(null)
            setStep('create-user')
            setMessage(null)
            setError(null)
            setRevertToken('')
          }}
        >
          Reset Demo
        </button>
      )}
    </div>
  )
}
