import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { adminChangePasscode, adminLogin, adminLogout, adminSessionValid } from '../lib/admin'

const STORAGE_KEY = 'tipping.admin.token'

interface AdminContextValue {
  token: string | null
  ready: boolean
  mustChangePasscode: boolean
  expiresAt: string | null
  signIn: (passcode: string) => Promise<void>
  signOut: () => Promise<void>
  changePasscode: (passcode: string) => Promise<void>
}

const AdminContext = createContext<AdminContextValue | null>(null)

export function AdminProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })
  const [ready, setReady] = useState(false)
  const [mustChangePasscode, setMustChangePasscode] = useState(false)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const stored = token

    if (!stored) {
      setReady(true)
      return
    }

    void adminSessionValid(stored)
      .then((result) => {
        if (cancelled) return
        if (!result.valid) {
          sessionStorage.removeItem(STORAGE_KEY)
          setToken(null)
          setMustChangePasscode(false)
        } else {
          setMustChangePasscode(result.must_change_passcode)
          setExpiresAt(result.expires_at)
        }
      })
      .catch(() => {
        if (cancelled) return
        sessionStorage.removeItem(STORAGE_KEY)
        setToken(null)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
    // Only re-validate when the token identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const signIn = useCallback(async (passcode: string) => {
    const result = await adminLogin(passcode)
    sessionStorage.setItem(STORAGE_KEY, result.token)
    setToken(result.token)
    setMustChangePasscode(result.must_change_passcode)
    setExpiresAt(result.expires_at)
  }, [])

  const signOut = useCallback(async () => {
    const current = token
    sessionStorage.removeItem(STORAGE_KEY)
    setToken(null)
    setMustChangePasscode(false)
    setExpiresAt(null)
    if (current) {
      try {
        await adminLogout(current)
      } catch {
        // token is discarded locally either way
      }
    }
  }, [token])

  const changePasscode = useCallback(
    async (passcode: string) => {
      if (!token) throw new Error('Sign in first')
      await adminChangePasscode(token, passcode)
      setMustChangePasscode(false)
    },
    [token],
  )

  const value = useMemo<AdminContextValue>(
    () => ({ token, ready, mustChangePasscode, expiresAt, signIn, signOut, changePasscode }),
    [token, ready, mustChangePasscode, expiresAt, signIn, signOut, changePasscode],
  )

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin(): AdminContextValue {
  const context = useContext(AdminContext)
  if (!context) throw new Error('useAdmin must be used inside <AdminProvider>')
  return context
}
