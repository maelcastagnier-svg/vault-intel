// lib/useGlobalRefresh.ts
// Timer global unique — tous les feeds se rafraichissent en même temps
import { useEffect, useState } from 'react'

// Intervalle global en ms — 60 secondes pour l'AH, 5 minutes pour le Bazaar
// On utilise 60s pour tout le monde — le Bazaar ne change pas souvent de toute façon
const REFRESH_INTERVAL_MS = 60_000

// Timestamp global partagé — incrémenté toutes les 60s pour tout le monde
let globalTick = 0
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  setInterval(() => {
    globalTick++
    listeners.forEach(fn => fn())
  }, REFRESH_INTERVAL_MS)
}

export function useGlobalRefresh(): number {
  const [tick, setTick] = useState(globalTick)

  useEffect(() => {
    const notify = () => setTick(t => t + 1)
    listeners.add(notify)
    return () => { listeners.delete(notify) }
  }, [])

  return tick
}

// Countdown jusqu'au prochain refresh (en secondes)
export function useRefreshCountdown(): number {
  const [seconds, setSeconds] = useState(REFRESH_INTERVAL_MS / 1000)

  useEffect(() => {
    // Sync sur le timer global
    let elapsed = (Date.now() % REFRESH_INTERVAL_MS) / 1000
    setSeconds(Math.ceil(REFRESH_INTERVAL_MS / 1000 - elapsed))

    const t = setInterval(() => {
      elapsed = (Date.now() % REFRESH_INTERVAL_MS) / 1000
      setSeconds(Math.ceil(REFRESH_INTERVAL_MS / 1000 - elapsed))
    }, 1000)

    return () => clearInterval(t)
  }, [])

  return seconds
}