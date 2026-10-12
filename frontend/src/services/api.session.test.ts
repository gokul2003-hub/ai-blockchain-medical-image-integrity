/**
 * Security-relevant session behaviour tests against the REAL exported auth
 * helpers in `services/api.ts`.
 *
 * These are isolated frontend tests using jsdom localStorage. They do NOT
 * contact a backend, and they are not a substitute for the server-side IDOR /
 * ownership checks, which are authoritative in the FastAPI layer and covered by
 * the backend suite. What is verified here is the client half of that boundary:
 * that a role switch or logout genuinely destroys the previous session and
 * leaves no stale credential behind.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAuthSession, getAuthToken, setAuthSession } from './api'

const TOKEN_KEY = 'med_token'
const LEGACY_TOKEN_KEY = 'token'
const USER_KEY = 'med_username'
const ROLE_KEY = 'med_role'

const ALL_KEYS = [TOKEN_KEY, LEGACY_TOKEN_KEY, USER_KEY, ROLE_KEY]

function read(key: string): string | null {
  return window.localStorage.getItem(key)
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('auth session - role switch leaves no stale state', () => {
  it('persists token, username and role on login', () => {
    setAuthSession('jwt-alice', 'alice', 'patient')

    expect(getAuthToken()).toBe('jwt-alice')
    expect(read(USER_KEY)).toBe('alice')
    expect(read(ROLE_KEY)).toBe('patient')
    // Written to both the current and the backwards-compatible key.
    expect(read(TOKEN_KEY)).toBe('jwt-alice')
    expect(read(LEGACY_TOKEN_KEY)).toBe('jwt-alice')
  })

  it('replaces every patient marker when the same browser logs in as a doctor', () => {
    setAuthSession('jwt-alice', 'alice', 'patient')
    clearAuthSession()
    setAuthSession('jwt-drsmith', 'drsmith', 'doctor')

    expect(getAuthToken()).toBe('jwt-drsmith')
    expect(read(ROLE_KEY)).toBe('doctor')
    expect(read(USER_KEY)).toBe('drsmith')

    // Nothing from the previous patient session may survive the switch.
    expect(read(TOKEN_KEY)).toBe('jwt-drsmith')
    expect(read(LEGACY_TOKEN_KEY)).toBe('jwt-drsmith')
    expect(JSON.stringify(window.localStorage)).not.toContain('alice')
    expect(JSON.stringify(window.localStorage)).not.toContain('patient')
  })

  it('does not inherit a role when a second login occurs without a logout', () => {
    // Documents current behaviour: setAuthSession overwrites in place, so a
    // direct re-login cannot leave two roles visible at once.
    setAuthSession('jwt-1', 'alice', 'patient')
    setAuthSession('jwt-2', 'bob', 'researcher')

    expect(read(ROLE_KEY)).toBe('researcher')
    expect(read(USER_KEY)).toBe('bob')
    expect(JSON.stringify(window.localStorage)).not.toContain('patient')
  })
})

describe('auth session - logout destroys the credential', () => {
  it('clears the current token', () => {
    setAuthSession('jwt-alice', 'alice', 'patient')
    clearAuthSession()

    expect(getAuthToken()).toBeNull()
    expect(read(TOKEN_KEY)).toBeNull()
  })

  it('clears the backwards-compatible legacy token key too', () => {
    // A stale legacy token surviving logout would silently re-authenticate the
    // next user of a shared machine.
    setAuthSession('jwt-alice', 'alice', 'patient')
    expect(read(LEGACY_TOKEN_KEY)).toBe('jwt-alice')

    clearAuthSession()
    expect(read(LEGACY_TOKEN_KEY)).toBeNull()
  })

  it('clears username and role so no identity is left behind', () => {
    setAuthSession('jwt-alice', 'alice', 'patient')
    clearAuthSession()

    expect(read(USER_KEY)).toBeNull()
    expect(read(ROLE_KEY)).toBeNull()
  })

  it('removes every session key it ever writes', () => {
    setAuthSession('jwt-alice', 'alice', 'patient')
    clearAuthSession()

    for (const key of ALL_KEYS) {
      expect(read(key)).toBeNull()
    }
    expect(window.localStorage.length).toBe(0)
  })

  it('is safe to call when no session exists', () => {
    expect(() => clearAuthSession()).not.toThrow()
    expect(getAuthToken()).toBeNull()
  })
})

describe('auth token retrieval - no silent credential reuse', () => {
  it('returns null when nothing is stored', () => {
    expect(getAuthToken()).toBeNull()
  })

  it('prefers the current key over the legacy key', () => {
    window.localStorage.setItem(LEGACY_TOKEN_KEY, 'legacy-only')
    expect(getAuthToken()).toBe('legacy-only')

    window.localStorage.setItem(TOKEN_KEY, 'current')
    expect(getAuthToken()).toBe('current')
  })

  it('never returns an empty-string token as if it were valid', () => {
    window.localStorage.setItem(TOKEN_KEY, '')
    const token = getAuthToken()
    // Falsy values must not be treated as an authenticated session.
    expect(Boolean(token)).toBe(false)
  })
})
