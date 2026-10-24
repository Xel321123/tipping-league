import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
  updatedAt: number | null
  refresh: () => void
}

interface Options {
  /** Poll interval in ms. Pauses while the tab is hidden. */
  pollMs?: number
  enabled?: boolean
}

export function useAsync<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList,
  options: Options = {},
): AsyncState<T> {
  const { pollMs, enabled = true } = options
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const mounted = useRef(true)
  const firstLoad = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async () => {
    if (firstLoad.current) setLoading(true)
    try {
      const next = await loaderRef.current()
      if (!mounted.current) return
      setData(next)
      setError(null)
      setUpdatedAt(Date.now())
    } catch (cause) {
      if (!mounted.current) return
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    } finally {
      if (mounted.current) {
        firstLoad.current = false
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    firstLoad.current = true
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (!pollMs || !enabled) return
    const timer = setInterval(() => {
      if (document.hidden) return
      void run()
    }, pollMs)
    return () => clearInterval(timer)
  }, [pollMs, enabled, run])

  const refresh = useCallback(() => {
    void run()
  }, [run])

  return { data, error, loading, updatedAt, refresh }
}

/** Re-renders every `intervalMs` — used for countdowns and "x min ago" labels. */
export function useTick(intervalMs = 30_000): number {
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return tick
}
