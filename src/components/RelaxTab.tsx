import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw, Wind } from 'lucide-react'

type BreathPhase = 'inhale' | 'hold' | 'exhale' | 'idle'

const PHASE_CONFIG: Record<BreathPhase, { label: string; seconds: number; color: string; scale: number }> = {
  idle: { label: 'Ready', seconds: 0, color: '#94a3b8', scale: 0.5 },
  inhale: { label: 'Breathe In', seconds: 4, color: '#22c55e', scale: 1 },
  hold: { label: 'Hold', seconds: 7, color: '#3b82f6', scale: 1 },
  exhale: { label: 'Breathe Out', seconds: 8, color: '#8b5cf6', scale: 0.5 },
}

export function RelaxTab() {
  const [phase, setPhase] = useState<BreathPhase>('idle')
  const [countdown, setCountdown] = useState(0)
  const [isActive, setIsActive] = useState(false)
  const [cycles, setCycles] = useState(0)
  const [totalCycles, setTotalCycles] = useState(4)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const phaseIndexRef = useRef(0)

  const phases: BreathPhase[] = ['inhale', 'hold', 'exhale']

  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setIsActive(false)
  }, [])

  const start = useCallback(() => {
    if (isActive) {
      stop()
      return
    }
    setIsActive(true)
    setCycles(0)
    phaseIndexRef.current = 0
    const first = phases[0]
    setPhase(first)
    setCountdown(PHASE_CONFIG[first].seconds)
  }, [isActive, stop])

  useEffect(() => {
    if (!isActive) return
    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          phaseIndexRef.current++
          if (phaseIndexRef.current >= phases.length) {
            phaseIndexRef.current = 0
            setCycles(c => {
              const next = c + 1
              if (next >= totalCycles) {
                setTimeout(() => { stop(); setPhase('idle'); setCountdown(0) }, 50)
                return next
              }
              return next
            })
          }
          const nextPhase = phases[phaseIndexRef.current % phases.length]
          setPhase(nextPhase)
          return PHASE_CONFIG[nextPhase].seconds
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isActive, totalCycles, stop])

  useEffect(() => () => stop(), [stop])

  const cfg = PHASE_CONFIG[phase]
  const progress = isActive && countdown > 0
    ? 1 - countdown / cfg.seconds
    : 0

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 space-y-6 overflow-y-auto">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-bold text-foreground flex items-center justify-center gap-2">
          <Wind className="w-5 h-5 text-primary" />
          4-7-8 Breathing
        </h2>
        <p className="text-xs text-muted-foreground">Inhale 4s · Hold 7s · Exhale 8s</p>
      </div>

      {/* Breathing Circle */}
      <div className="relative flex items-center justify-center">
        {/* Outer glow ring */}
        <motion.div
          className="absolute rounded-full border-2 border-primary/20"
          style={{ width: 240, height: 240 }}
          animate={{ scale: phase === 'inhale' ? 1.15 : phase === 'exhale' ? 0.9 : 1, opacity: isActive ? 0.3 : 0.1 }}
          transition={{ duration: phase === 'inhale' ? 4 : phase === 'exhale' ? 8 : 7, ease: 'easeInOut' }}
        />

        {/* Progress ring */}
        <svg className="absolute" width="240" height="240" viewBox="0 0 240 240">
          <circle cx="120" cy="120" r="110" fill="none" stroke="currentColor" strokeWidth="2" className="text-border/30" />
          <motion.circle
            cx="120" cy="120" r="110" fill="none"
            stroke={cfg.color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 110}
            strokeDashoffset={2 * Math.PI * 110 * (1 - progress)}
            transform="rotate(-90 120 120)"
            style={{ filter: `drop-shadow(0 0 8px ${cfg.color}40)` }}
          />
        </svg>

        {/* Main breathing circle */}
        <motion.div
          className="rounded-full flex items-center justify-center bg-gradient-to-br shadow-lg"
          style={{
            width: 180,
            height: 180,
            background: isActive
              ? `radial-gradient(circle at 40% 40%, ${cfg.color}40, ${cfg.color}20 60%, transparent)`
              : 'radial-gradient(circle at 40% 40%, rgba(148,163,184,0.2), rgba(148,163,184,0.05) 60%, transparent)',
          }}
          animate={{ scale: cfg.scale }}
          transition={{ duration: cfg.seconds, ease: 'easeInOut' }}
        >
          <motion.div
            className="flex flex-col items-center gap-0.5 text-center"
            animate={{ scale: phase === 'inhale' ? 1.05 : phase === 'exhale' ? 1.1 : 1 }}
            transition={{ duration: cfg.seconds, ease: 'easeInOut' }}
          >
            <span className="text-3xl font-bold text-foreground tabular-nums">
              {isActive ? countdown : '4-7-8'}
            </span>
            <span className="text-xs font-medium tracking-wider uppercase" style={{ color: cfg.color }}>
              {cfg.label}
            </span>
          </motion.div>
        </motion.div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={start}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
        >
          {isActive ? <><Pause className="w-4 h-4" />Pause</> : <><Play className="w-4 h-4" />Start</>}
        </motion.button>
        {isActive && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { stop(); setPhase('idle'); setCountdown(0); setCycles(0) }}
            className="p-3 rounded-2xl border border-border hover:bg-muted transition-colors"
          >
            <RotateCcw className="w-4 h-4 text-muted-foreground" />
          </motion.button>
        )}
      </div>

      {/* Cycles selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Cycles:</span>
        {[2, 4, 6, 8].map(n => (
          <button
            key={n}
            onClick={() => !isActive && setTotalCycles(n)}
            disabled={isActive}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              totalCycles === n ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
            } disabled:opacity-50`}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Progress */}
      {isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <p className="text-sm text-foreground font-medium">
            Cycle {cycles + 1} of {totalCycles}
          </p>
          <div className="mt-2 flex gap-1.5 justify-center">
            {Array.from({ length: totalCycles }).map((_, i) => (
              <motion.div
                key={i}
                className={`w-2 h-2 rounded-full ${i < cycles ? 'bg-primary' : i === cycles ? 'bg-primary/60' : 'bg-muted'}`}
                animate={i === cycles ? { scale: [1, 1.3, 1] } : {}}
                transition={{ duration: 1, repeat: i === cycles ? Infinity : 0 }}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* Info */}
      <div className="max-w-xs text-center">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          The 4-7-8 technique activates your parasympathetic nervous system, reducing anxiety and promoting calm. Practice 2x daily for best results.
        </p>
      </div>
    </div>
  )
}
