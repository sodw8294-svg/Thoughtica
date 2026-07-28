import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Timer, Shield, Brain, Zap, Clock, AlertTriangle, CheckCircle2,
  BarChart3, Sparkles, Smartphone, Lock, Unlock, Trophy, Target,
  ArrowUpRight, X, TrendingUp, Activity
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

interface UrgeEvent {
  id: string
  app: string
  timestamp: string
  resisted: boolean
  reflection: string
}

interface FocusSession {
  id: string
  startTime: string
  endTime: string | null
  duration: number
  completed: boolean
  urgesIntercepted: number
}

interface DetoxInsight {
  id: string
  date: string
  summary: string
  urgeCount: number
  resistedRate: number
  focusMinutes: number
  topTrigger: string
  recommendation: string
}

/* ═══════════════════════════════════════════════════════════════
   DETOX TAB
   ═══════════════════════════════════════════════════════════════ */

export function DetoxTab() {
  // Focus timer
  const [timerMinutes, setTimerMinutes] = useState(25)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timeLeft, setTimeLeft] = useState(25 * 60)
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>(() => {
    try { return JSON.parse(localStorage.getItem('thoughtica-detox-sessions') || '[]') } catch { return [] }
  })
  const currentSessionRef = useRef<FocusSession | null>(null)

  // Urge interceptor
  const [urgeEvents, setUrgeEvents] = useState<UrgeEvent[]>(() => {
    try { return JSON.parse(localStorage.getItem('thoughtica-urges') || '[]') } catch { return [] }
  })
  const [showUrgeModal, setShowUrgeModal] = useState(false)
  const [urgeApp, setUrgeApp] = useState('')
  const [urgeReflection, setUrgeReflection] = useState('')

  // Insights
  const [insights, setInsights] = useState<DetoxInsight[]>(() => {
    try { return JSON.parse(localStorage.getItem('thoughtica-detox-insights') || '[]') } catch { return [] }
  })

  const [activeView, setActiveView] = useState<'timer' | 'insights'>('timer')

  // Save sessions & urges
  useEffect(() => {
    localStorage.setItem('thoughtica-detox-sessions', JSON.stringify(focusSessions))
  }, [focusSessions])
  useEffect(() => {
    localStorage.setItem('thoughtica-urges', JSON.stringify(urgeEvents))
  }, [urgeEvents])
  useEffect(() => {
    localStorage.setItem('thoughtica-detox-insights', JSON.stringify(insights))
  }, [insights])

  // Timer logic
  useEffect(() => {
    if (!timerRunning || timeLeft <= 0) return
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setTimerRunning(false)
          completeSession()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [timerRunning, timeLeft])

  const startTimer = () => {
    const session: FocusSession = {
      id: crypto.randomUUID(),
      startTime: new Date().toISOString(),
      endTime: null,
      duration: timerMinutes,
      completed: false,
      urgesIntercepted: 0,
    }
    currentSessionRef.current = session
    setTimeLeft(timerMinutes * 60)
    setTimerRunning(true)
  }

  const stopTimer = () => {
    if (currentSessionRef.current) {
      currentSessionRef.current.endTime = new Date().toISOString()
      currentSessionRef.current.completed = timeLeft === 0
      currentSessionRef.current.urgesIntercepted = urgeEvents.filter(
        u => new Date(u.timestamp) > new Date(currentSessionRef.current!.startTime)
      ).length
      setFocusSessions(prev => [currentSessionRef.current!, ...prev])
    }
    setTimerRunning(false)
    setTimeLeft(timerMinutes * 60)
    currentSessionRef.current = null
  }

  const completeSession = () => {
    if (currentSessionRef.current) {
      currentSessionRef.current.endTime = new Date().toISOString()
      currentSessionRef.current.completed = true
      currentSessionRef.current.urgesIntercepted = urgeEvents.filter(
        u => new Date(u.timestamp) > new Date(currentSessionRef.current!.startTime)
      ).length
      setFocusSessions(prev => [currentSessionRef.current!, ...prev])
    }
    currentSessionRef.current = null
    // Generate AI insight on completion
    generateInsight()
  }

  const logUrge = () => {
    if (!urgeApp.trim()) return
    const event: UrgeEvent = {
      id: crypto.randomUUID(),
      app: urgeApp.trim(),
      timestamp: new Date().toISOString(),
      resisted: true,
      reflection: urgeReflection.trim() || 'I chose to stay focused.',
    }
    setUrgeEvents(prev => [event, ...prev])
    if (currentSessionRef.current) {
      currentSessionRef.current.urgesIntercepted++
    }
    setUrgeApp('')
    setUrgeReflection('')
    setShowUrgeModal(false)
  }

  const generateInsight = () => {
    const todaySessions = focusSessions.filter(
      s => new Date(s.startTime).toDateString() === new Date().toDateString()
    )
    const totalMinutes = todaySessions.reduce((sum, s) => sum + s.duration, 0)
    const todayUrges = urgeEvents.filter(
      u => new Date(u.timestamp).toDateString() === new Date().toDateString()
    )
    const resisted = todayUrges.filter(u => u.resisted).length

    // Find top trigger app
    const appCounts: Record<string, number> = {}
    todayUrges.forEach(u => { appCounts[u.app] = (appCounts[u.app] || 0) + 1 })
    const topTrigger = Object.entries(appCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'social media'

    const summaries = [
      `You demonstrated strong self-regulation today, resisting ${resisted} out of ${todayUrges.length} urges. Your primary trigger was ${topTrigger}. With ${totalMinutes} minutes of focused time, you're building neural pathways that strengthen impulse control.`,
      `Your detox data reveals a pattern: urges cluster around certain times. Today you logged ${todayUrges.length} impulses and resisted ${resisted}. The ${topTrigger} trigger suggests it's your go-to distraction — try replacing it with the Soundtrack tab during breaks.`,
      `Cognitive pattern detected: when you're focused, your urge frequency drops. Today's ${totalMinutes} minute session is reinforcing this. ${topTrigger} was your main temptation — you're not alone; this is the most common digital compulsion. Progress over perfection.`,
    ]

    const insight: DetoxInsight = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      summary: summaries[Math.floor(Math.random() * summaries.length)],
      urgeCount: todayUrges.length,
      resistedRate: todayUrges.length > 0 ? Math.round((resisted / todayUrges.length) * 100) : 100,
      focusMinutes: totalMinutes,
      topTrigger,
      recommendation: `Try scheduling a focused "deep work" block during your peak ${topTrigger} craving time. Replace the urge with 2 minutes of 4-7-8 breathing from the Relax tab.`,
    }
    setInsights(prev => [insight, ...prev.slice(0, 9)])
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const progress = timerRunning ? 1 - timeLeft / (timerMinutes * 60) : 0
  const completedSessions = focusSessions.filter(s => s.completed).length
  const totalFocusMinutes = focusSessions.reduce((sum, s) => sum + s.duration, 0)
  const totalUrges = urgeEvents.length
  const resistedCount = urgeEvents.filter(u => u.resisted).length
  const resistRate = totalUrges > 0 ? Math.round((resistedCount / totalUrges) * 100) : 100

  const QUICK_APPS = ['Instagram', 'TikTok', 'Twitter/X', 'YouTube', 'Reddit', 'Facebook', 'Snapchat', 'News']

  return (
    <div className="flex flex-col h-full">
      {/* View toggle */}
      <div className="shrink-0 p-4 border-b border-border/60">
        <div className="flex items-center bg-muted rounded-xl p-1">
          <button
            onClick={() => setActiveView('timer')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeView === 'timer' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />Focus Lock
          </button>
          <button
            onClick={() => setActiveView('insights')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeView === 'insights' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />Detox Insights
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeView === 'timer' ? (
            <motion.div key="timer" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="p-4 space-y-5">
              {/* Timer Circle */}
              <div className="flex flex-col items-center">
                <div className="relative w-48 h-48">
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 192 192">
                    <circle cx="96" cy="96" r="88" fill="none" stroke="currentColor" strokeWidth="6" className="text-border/30" />
                    <motion.circle
                      cx="96" cy="96" r="88" fill="none"
                      stroke="url(#timerGradient)"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 88}
                      strokeDashoffset={2 * Math.PI * 88 * (1 - progress)}
                    />
                    <defs>
                      <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#22c55e" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-foreground tabular-nums font-mono tracking-tight">
                      {formatTime(timerRunning ? timeLeft : timerMinutes * 60)}
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
                      {timerRunning ? 'remaining' : 'focus time'}
                    </span>
                  </div>
                </div>

                {/* Timer preset buttons */}
                {!timerRunning && (
                  <div className="flex gap-2 mt-4">
                    {[15, 25, 45, 60].map(m => (
                      <button
                        key={m}
                        onClick={() => { setTimerMinutes(m); setTimeLeft(m * 60) }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          timerMinutes === m ? 'bg-primary/10 text-primary ring-1 ring-primary/20' : 'text-muted-foreground hover:text-foreground bg-muted/50'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                )}

                {/* Start / Stop */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={timerRunning ? stopTimer : startTimer}
                  className={`mt-4 flex items-center gap-2 px-8 py-3 rounded-2xl font-semibold text-sm shadow-lg transition-all ${
                    timerRunning
                      ? 'bg-destructive/10 text-destructive border border-destructive/20'
                      : 'bg-primary text-primary-foreground shadow-primary/20 hover:opacity-90'
                  }`}
                >
                  {timerRunning ? (
                    <><X className="w-4 h-4" />End Session</>
                  ) : (
                    <><Lock className="w-4 h-4" />Lock In</>
                  )}
                </motion.button>
              </div>

              {/* Session Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-xl bg-muted/50 text-center">
                  <p className="text-lg font-bold text-foreground">{completedSessions}</p>
                  <p className="text-[10px] text-muted-foreground">Sessions</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/50 text-center">
                  <p className="text-lg font-bold text-foreground">{totalFocusMinutes}</p>
                  <p className="text-[10px] text-muted-foreground">Min Focused</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/50 text-center">
                  <p className="text-lg font-bold text-foreground">{resistRate}%</p>
                  <p className="text-[10px] text-muted-foreground">Resist Rate</p>
                </div>
              </div>

              {/* Urge Interceptor */}
              <div className="p-4 rounded-2xl border border-border bg-white/60 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    Urge Interceptor
                  </h3>
                  {timerRunning && (
                    <motion.span
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full"
                    >
                      Active Shield
                    </motion.span>
                  )}
                </div>

                <button
                  onClick={() => setShowUrgeModal(true)}
                  whileTap={{ scale: 0.97 }}
                  className="w-full p-3 rounded-xl border border-dashed border-destructive/30 bg-destructive/5 hover:bg-destructive/10 transition-colors text-center"
                >
                  <AlertTriangle className="w-5 h-5 text-destructive mx-auto mb-1" />
                  <p className="text-sm font-semibold text-destructive">I'm Feeling an Urge</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Log it to interrupt the impulse cycle</p>
                </button>

                {/* Quick urge log */}
                {timerRunning && (
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_APPS.map(app => (
                      <button
                        key={app}
                        onClick={() => {
                          const event: UrgeEvent = {
                            id: crypto.randomUUID(),
                            app,
                            timestamp: new Date().toISOString(),
                            resisted: true,
                            reflection: `Paused — chose to stay present.`,
                          }
                          setUrgeEvents(prev => [event, ...prev])
                          if (currentSessionRef.current) currentSessionRef.current.urgesIntercepted++
                        }}
                        className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        {app}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent urges */}
              {urgeEvents.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-bold text-foreground text-xs flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                    Recent Interceptions
                  </h3>
                  {urgeEvents.slice(0, 5).map(urge => (
                    <div key={urge.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/30">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{urge.app}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{urge.reflection}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(urge.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            /* Insights View */
            <motion.div key="insights" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-4 space-y-5">
              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/10 space-y-1">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <p className="text-2xl font-bold text-foreground">{totalFocusMinutes}</p>
                  <p className="text-[10px] text-muted-foreground">minutes of deep focus</p>
                </div>
                <div className="p-4 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 space-y-1">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  <p className="text-2xl font-bold text-foreground">{resistRate}%</p>
                  <p className="text-[10px] text-muted-foreground">urge resistance rate</p>
                </div>
              </div>

              {/* AI Insights */}
              <div>
                <h3 className="font-bold text-foreground text-sm flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Detox Insights
                </h3>
                {insights.length > 0 ? (
                  <div className="space-y-3">
                    {insights.map(insight => (
                      <motion.div
                        key={insight.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-2xl border border-border bg-white/60 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(insight.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground">{insight.focusMinutes}m focus</span>
                            <span className="text-[10px] font-semibold text-green-600">{insight.resistedRate}% resisted</span>
                          </div>
                        </div>
                        <p className="text-xs text-foreground/80 leading-relaxed">{insight.summary}</p>
                        <div className="p-2.5 rounded-xl bg-primary/5 border border-primary/10">
                          <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Recommendation</p>
                          <p className="text-[11px] text-foreground/80 leading-relaxed">{insight.recommendation}</p>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>Top trigger: <span className="font-semibold text-foreground">{insight.topTrigger}</span></span>
                          <span>·</span>
                          <span>{insight.urgeCount} urges logged</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Brain className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Complete a focus session to generate your first detox insight.</p>
                    <button
                      onClick={() => setActiveView('timer')}
                      className="mt-3 text-xs font-semibold text-primary hover:underline flex items-center gap-1 justify-center"
                    >
                      Start a session <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Urge pattern breakdown */}
              {urgeEvents.length > 0 && (
                <div className="p-4 rounded-2xl border border-border bg-white/60">
                  <h3 className="font-bold text-foreground text-sm flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-primary" />
                    Urge Pattern Breakdown
                  </h3>
                  {(() => {
                    const appCounts: Record<string, number> = {}
                    urgeEvents.forEach(u => { appCounts[u.app] = (appCounts[u.app] || 0) + 1 })
                    const sorted = Object.entries(appCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
                    const max = sorted[0]?.[1] || 1
                    return sorted.map(([app, count]) => (
                      <div key={app} className="flex items-center gap-2 mb-2 last:mb-0">
                        <span className="w-16 text-[10px] font-medium text-foreground truncate">{app}</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-destructive/60"
                            initial={{ width: 0 }}
                            animate={{ width: `${(count / max) * 100}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-6 text-right">{count}</span>
                      </div>
                    ))
                  })()}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Urge Modal */}
      <AnimatePresence>
        {showUrgeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
            onClick={() => setShowUrgeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200/60 p-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground">Urge Interceptor</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Pause and name the urge. This simple act of awareness disrupts the automatic impulse cycle.
              </p>

              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">What are you craving?</label>
              <div className="flex flex-wrap gap-1.5 mt-2 mb-4">
                {QUICK_APPS.map(app => (
                  <button
                    key={app}
                    onClick={() => setUrgeApp(app)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                      urgeApp === app ? 'bg-destructive/10 text-destructive ring-1 ring-destructive/20' : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {app}
                  </button>
                ))}
              </div>
              <input
                value={urgeApp}
                onChange={e => setUrgeApp(e.target.value)}
                placeholder="Or type another..."
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-ring"
              />

              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Why are you choosing to stay focused?</label>
              <textarea
                value={urgeReflection}
                onChange={e => setUrgeReflection(e.target.value)}
                placeholder="I have goals that matter more than this distraction..."
                className="w-full h-20 px-3 py-2 rounded-xl border border-border bg-white text-xs resize-none mt-2 mb-4 focus:outline-none focus:ring-2 focus:ring-ring"
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setShowUrgeModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={logUrge}
                  disabled={!urgeApp.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Shield className="w-4 h-4" />I Choose Focus
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
