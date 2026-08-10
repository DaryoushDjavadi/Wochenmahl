import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

const BURST_COLORS = [
  '#2f6f4e',
  '#b85c38',
  '#0aa8a6',
  '#e6a23c',
  '#5b7cfa',
  '#d46b8c',
]

type Burst = {
  id: number
  x: number
  y: number
  colors: string[]
}

let burstId = 0
const burstListeners = new Set<(b: Burst) => void>()

/** Particle splash at a screen position (e.g. after delete). */
export function spawnBurst(
  clientX: number,
  clientY: number,
  colors: string[] = BURST_COLORS,
) {
  if (typeof window === 'undefined') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const burst: Burst = {
    id: ++burstId,
    x: clientX,
    y: clientY,
    colors,
  }
  for (const listener of burstListeners) listener(burst)
}

/** Soft ripple inside a button from the pointer. */
export function spawnBtnSplash(
  el: HTMLElement,
  clientX: number,
  clientY: number,
) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const rect = el.getBoundingClientRect()
  const splash = document.createElement('span')
  splash.className = 'btn-splash'
  splash.style.left = `${clientX - rect.left}px`
  splash.style.top = `${clientY - rect.top}px`
  el.appendChild(splash)
  splash.addEventListener('animationend', () => splash.remove(), { once: true })
  window.setTimeout(() => splash.remove(), 700)
}

/**
 * Play exit class on an element, spawn burst, then run `done`.
 * Returns false if reduced-motion / no element (caller should delete immediately).
 */
export function playBurstExit(
  el: HTMLElement | null,
  done: () => void,
  ms = 420,
): boolean {
  if (
    !el ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    done()
    return false
  }
  const rect = el.getBoundingClientRect()
  spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2)
  el.classList.add('fx-burst-out')
  window.setTimeout(done, ms)
  return true
}

/** Track ids that just appeared — for pop-in CSS. */
export function useJustAppeared(ids: string[], holdMs = 560): Set<string> {
  const key = ids.join('\0')
  const prevKeyRef = useRef<string | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const prevKey = prevKeyRef.current
    prevKeyRef.current = key
    if (prevKey === null) return

    const prev = new Set(prevKey === '' ? [] : prevKey.split('\0'))
    const appeared = ids.filter((id) => !prev.has(id))
    if (appeared.length === 0) return

    setFresh((cur) => {
      const merged = new Set(cur)
      for (const id of appeared) merged.add(id)
      return merged
    })

    const t = window.setTimeout(() => {
      setFresh((cur) => {
        const cleaned = new Set(cur)
        for (const id of appeared) cleaned.delete(id)
        return cleaned
      })
    }, holdMs)
    return () => clearTimeout(t)
  }, [key, holdMs, ids])

  return fresh
}

/** Global button ripples + burst portal host. Mount once near app root. */
export function MotionRoot({ children }: { children?: ReactNode }) {
  const [bursts, setBursts] = useState<Burst[]>([])

  useEffect(() => {
    const onBurst = (b: Burst) => {
      setBursts((list) => [...list, b])
      window.setTimeout(() => {
        setBursts((list) => list.filter((x) => x.id !== b.id))
      }, 700)
    }
    burstListeners.add(onBurst)
    return () => {
      burstListeners.delete(onBurst)
    }
  }, [])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const target = e.target
      if (!(target instanceof Element)) return
      const btn = target.closest('.btn')
      if (!(btn instanceof HTMLElement)) return
      if (
        btn.classList.contains('no-splash') ||
        (btn instanceof HTMLButtonElement && btn.disabled)
      )
        return
      if (!btn.classList.contains('btn-splash-host')) {
        btn.classList.add('btn-splash-host')
      }
      spawnBtnSplash(btn, e.clientX, e.clientY)
    }
    document.addEventListener('pointerdown', onPointerDown, { passive: true })
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  return (
    <>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <div className="fx-layer" aria-hidden>
              {bursts.map((b) => (
                <div
                  key={b.id}
                  className="fx-burst"
                  style={{ left: b.x, top: b.y }}
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const angle = (i / 12) * Math.PI * 2 + 0.2
                    const dist = 26 + (i % 5) * 12
                    return (
                      <span
                        key={i}
                        className="fx-burst-dot"
                        style={
                          {
                            '--i': i,
                            '--c': b.colors[i % b.colors.length],
                            '--tx': `${Math.cos(angle) * dist}px`,
                            '--ty': `${Math.sin(angle) * dist}px`,
                            '--s': `${6 + (i % 3) * 3}px`,
                          } as CSSProperties
                        }
                      />
                    )
                  })}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
