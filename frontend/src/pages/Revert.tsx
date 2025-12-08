import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import * as api from '../api'
import './Revert.css'

export function Revert() {
  const { token } = useParams<{ token: string }>()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [nickname, setNickname] = useState<string | null>(null)

  // Guard against double-execution in React StrictMode
  const hasCalledRef = useRef(false)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('No revert token provided')
      return
    }

    // Prevent double-execution (React StrictMode runs effects twice)
    if (hasCalledRef.current) {
      return
    }
    hasCalledRef.current = true

    api.revertChange(token)
      .then((result) => {
        setStatus('success')
        setMessage(result.message)
        setNickname(result.nickname)
      })
      .catch((err: api.ApiError) => {
        setStatus('error')
        setMessage(err.message || 'Failed to revert change')
      })
  }, [token])

  return (
    <div className="revert-container">
      <div className="revert-card">
        {status === 'loading' && (
          <>
            <div className="spinner" />
            <h1>Reverting change...</h1>
            <p>Please wait</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="icon success-icon">&#10003;</div>
            <h1>Change Reverted</h1>
            <p>{message}</p>
            <p className="note">No confirmation email was sent (corrections are silent).</p>
            <Link to={nickname ? `/users/${nickname}` : '/'} className="btn">
              {nickname ? 'Back to Profile' : 'Go to Home'}
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="icon error-icon">&#10007;</div>
            <h1>Revert Failed</h1>
            <p>{message}</p>
            <p className="note">The token may have already been used or expired.</p>
            <Link to="/" className="btn">Go to Home</Link>
          </>
        )}
      </div>
    </div>
  )
}
