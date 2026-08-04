import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback, type FormEvent, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Brain, PenLine, Music, Target, BarChart3, MessageCircle,
  Send, Heart, Moon, Sun, Zap, Trophy, Star, Crown, Check, ChevronRight,
  ChevronLeft, X, Download, Settings, Volume2, Play, Pause, Plus,
  Trash2, ArrowUp, ArrowRight, RefreshCw, Quote, BookOpen, Compass,
  Gem, Clock, Flame, Shield, Bell, Info, Smile, Frown, Meh, Wind, Timer, type LucideIcon
} from 'lucide-react'
import { RelaxTab } from '@/components/RelaxTab'
import { SoundtrackTab } from '@/components/SoundtrackTab'
import { DetoxTab } from '@/components/DetoxTab'
import { blink } from '@/blink/client'
import { processCompanionTurn, loadConversation, loadPersonality, loadMemories } from '@/lib/companion'
import type { RpgContext } from '@/lib/companion'

/* ═══════════════════════════════════════════════════════════════
   TYPES & DEFAULTS
   ═══════════════════════════════════════════════════════════════ */

type Tier = 'free' | 'pro'
type CompanionPersona = 'calm-philosopher' | 'gentle-strategist' | 'socratic-mentor'
type AuraMood = 'dawn-mist' | 'sage-sanctuary' | 'twilight-solitude'
type TabId = 'companion' | 'journal' | 'relax' | 'soundscapes' | 'soundtrack' | 'detox' | 'rituals' | 'reports'

interface CompanionConfig { name: string; persona: CompanionPersona; aura: AuraMood }
interface JournalEntry { id: string; text: string; mood: 'happy' | 'neutral' | 'sad'; createdAt: string; aiReflection?: string }
interface ChatMessage { id: string; role: 'user' | 'companion'; text: string; timestamp: string }
interface PathMarker { id: string; text: string; completed: boolean; createdAt: string }
interface Badge { id: string; name: string; description: string; icon: string; unlockedAt?: string }
interface SoulReport { id: string; date: string; moodTrend: number[]; topTopics: string[]; tasksCompleted: number; summary: string }

interface AppState {
  onboardingDone: boolean
  companion: CompanionConfig
  tier: Tier
  trialActive: boolean
  trialStartDate: string | null
  xp: number
  level: number
  streak: number
  lastActiveDate: string | null
  journalEntries: JournalEntry[]
  chatMessages: ChatMessage[]
  aiInteractionsRemaining: number
  pathMarkers: PathMarker[]
  intention: string
  wordOfDay: { word: string; definition: string; date: string }
  badges: Badge[]
  soundMix: { rain: number; wind: number; fire: number; ocean: number }
  activeSoundscape: string | null
  reports: SoulReport[]
  billingInterval: 'monthly' | 'annual'
}

const PERSONAS: Record<CompanionPersona, { label: string; desc: string; emoji: string }> = {
  'calm-philosopher': { label: 'The Calm Philosopher', desc: 'Gentle wisdom rooted in stoic tranquility.', emoji: '🏛️' },
  'gentle-strategist': { label: 'The Gentle Strategist', desc: 'Practical clarity with compassionate guidance.', emoji: '🧭' },
  'socratic-mentor': { label: 'The Socratic Mentor', desc: 'Provocative questions that unlock insight.', emoji: '🦉' },
}

const AURAS: Record<AuraMood, { label: string; desc: string; gradient: string }> = {
  'dawn-mist': { label: 'Dawn Mist', desc: 'Soft lavender to warm peach.', gradient: 'from-purple-100 via-rose-50 to-amber-50' },
  'sage-sanctuary': { label: 'Sage Sanctuary', desc: 'Muted sage green to stone.', gradient: 'from-emerald-50 via-stone-50 to-teal-50' },
  'twilight-solitude': { label: 'Twilight Solitude', desc: 'Deep indigo to silver blue.', gradient: 'from-indigo-100 via-slate-50 to-sky-100' },
}

const AURA_GRADIENTS: Record<AuraMood, string> = {
  'dawn-mist': 'from-purple-200/40 via-rose-100/30 to-amber-100/40',
  'sage-sanctuary': 'from-emerald-200/40 via-stone-100/30 to-teal-100/40',
  'twilight-solitude': 'from-indigo-200/40 via-slate-100/30 to-sky-100/40',
}

const WORDS_OF_DAY = [
  { word: 'Equanimity', definition: 'Mental calmness and composure, especially in difficult situations.' },
  { word: 'Sonder', definition: 'The realization that every passerby has a life as vivid and complex as your own.' },
  { word: 'Ephemeral', definition: 'Lasting for a very short time; a reminder to savor the present.' },
  { word: 'Resilience', definition: 'The capacity to recover quickly from difficulties; inner toughness.' },
  { word: 'Ubuntu', definition: 'A quality that includes the essential human virtues of compassion and humanity.' },
  { word: 'Kintsugi', definition: 'The Japanese art of repairing broken pottery with gold — embracing flaws.' },
  { word: 'Petrichor', definition: 'The pleasant, earthy scent after rain — a moment of grounding.' },
]

const ALL_BADGES: Badge[] = [
  { id: 'first-reflection', name: 'First Reflection', description: 'Wrote your first journal entry.', icon: 'BookOpen' },
  { id: '7-day-streak', name: '7-Day Streak Master', description: 'Maintained a 7-day mindfulness streak.', icon: 'Flame' },
  { id: 'zen-master', name: 'Zen Master', description: 'Reached Level 5 in your mindfulness journey.', icon: 'Trophy' },
  { id: 'sound-explorer', name: 'Sound Explorer', description: 'Tried all four soundscapes.', icon: 'Music' },
  { id: 'path-clearer', name: 'Path Clearer', description: 'Completed 10 path markers.', icon: 'Target' },
  { id: 'ai-bond', name: 'AI Bond', description: 'Had 50 conversations with your companion.', icon: 'Sparkles' },
]

const SOUND_PRESETS = [
  { id: 'rain', name: 'Rain on Glass', icon: 'CloudRain' as const, freq: 200 },
  { id: 'forest', name: 'Forest Canopy', icon: 'TreePine' as const, freq: 350 },
  { id: 'binaural', name: 'Deep Delta Binaural', icon: 'Waves' as const, freq: 140 },
  { id: 'hearth', name: 'Warm Hearth Fire', icon: 'Flame' as const, freq: 500 },
]

const XP_PER_TASK = 50
const XP_PER_INTENTION = 25
const FREE_AI_LIMIT = 10
const PRICING = {
  pro: { monthly: 4.99 },
}

function todayStr() { return new Date().toISOString().split('T')[0] }

function getDefaultState(): AppState {
  return {
    onboardingDone: false,
    companion: { name: 'Aria', persona: 'calm-philosopher', aura: 'sage-sanctuary' },
    tier: 'free',
    trialActive: false,
    trialStartDate: null,
    xp: 0,
    level: 1,
    streak: 0,
    lastActiveDate: null,
    journalEntries: [],
    chatMessages: [{ id: 'welcome', role: 'companion', text: 'Welcome to your sanctuary. I\'m here to walk with you. How are you feeling today?', timestamp: new Date().toISOString() }],
    aiInteractionsRemaining: FREE_AI_LIMIT,
    pathMarkers: [],
    intention: '',
    wordOfDay: { word: 'Equanimity', definition: 'Mental calmness and composure, especially in difficult situations.', date: todayStr() },
    badges: [],
    soundMix: { rain: 65, wind: 30, fire: 40, ocean: 50 },
    activeSoundscape: null,
    reports: [],
    billingInterval: 'monthly',
  }
}

/* ═══════════════════════════════════════════════════════════════
   LOCAL STORAGE HOOK
   ═══════════════════════════════════════════════════════════════ */

function loadState(): AppState {
  try {
    const raw = localStorage.getItem('thoughtica-state')
    if (raw) return { ...getDefaultState(), ...JSON.parse(raw) }
  } catch {}
  return getDefaultState()
}

function saveState(s: AppState) {
  try { localStorage.setItem('thoughtica-state', JSON.stringify(s)) } catch {}
}

/* ═══════════════════════════════════════════════════════════════
   COMPANION AI RESPONSE GENERATOR
   ═══════════════════════════════════════════════════════════════ */

const COMPANION_RESPONSES: Record<string, string[]> = {
  feeling: [
    'Thank you for sharing that. Your feelings are valid messengers — not obstacles. What do you think this emotion is trying to tell you?',
    'I hear you. Sometimes just naming what we feel opens a door. Would you like to explore this together?',
    'That resonates deeply. Emotions are the body\'s wisdom — let\'s sit with this a moment and see what unfolds.',
  ],
  stress: [
    'Stress is often our mind\'s way of preparing for something important. Let\'s deconstruct it: what\'s the one thing weighing heaviest right now?',
    'I sense tension. Try this: breathe in for 4 counts, hold for 4, out for 6. I\'ll count with you. Ready?',
    'Stress narrows our vision. Let\'s widen the lens — in six months, how significant will this feel?',
  ],
  gratitude: [
    'Gratitude is a quiet superpower. What you\'ve noticed reveals what you truly value. Hold onto that.',
    'Beautiful. Research shows that naming three gratitudes daily rewires neural pathways toward joy. You\'re doing that work right now.',
    'That\'s a profound observation. Gratitude transforms what we have into enough — and you just practiced that.',
  ],
  advice: [
    'Here\'s what I\'d offer: clarity comes from action, not rumination. What\'s the smallest step you could take today toward resolution?',
    'Consider this — every challenge you\'ve faced before, you\'ve survived. What strengths from those experiences can you draw on now?',
    'The Stoics believed we suffer more in imagination than in reality. Let\'s separate what\'s actually happening from what you\'re fearing might happen.',
  ],
  reminder: [
    'I\'ve noted this. A gentle nudge: self-compassion isn\'t self-indulgence — it\'s the foundation from which real change grows.',
    'Reminder set. Remember, progress isn\'t linear. A spiral staircase still goes upward, even when it feels like you\'re going in circles.',
    'I\'ll hold this for you. Between now and then, try to notice one moment of unexpected beauty each day.',
  ],
  general: [
    'That\'s worth exploring. What would it look like if you gave yourself permission to approach this with curiosity instead of judgment?',
    'I\'m with you. Sometimes the bravest thing we can do is simply show up. And you\'re here — that counts for everything.',
    'Your mind is a sanctuary. Let\'s tend to it together, one thought at a time. What would feel nourishing right now?',
    'Rilke wrote: "Be patient toward all that is unsolved in your heart." Some answers ripen with time, not effort.',
  ],
}

function generateCompanionResponse(userMessage: string, persona: CompanionPersona): string {
  const lower = userMessage.toLowerCase()
  let pool = COMPANION_RESPONSES.general

  if (lower.includes('stress') || lower.includes('anxious') || lower.includes('overwhelm') || lower.includes('worried')) {
    pool = COMPANION_RESPONSES.stress
  } else if (lower.includes('grateful') || lower.includes('thankful') || lower.includes('blessed') || lower.includes('appreciate')) {
    pool = COMPANION_RESPONSES.gratitude
  } else if (lower.includes('feel') || lower.includes('sad') || lower.includes('angry') || lower.includes('happy') || lower.includes('lonely')) {
    pool = COMPANION_RESPONSES.feeling
  } else if (lower.includes('advice') || lower.includes('help') || lower.includes('what should')) {
    pool = COMPANION_RESPONSES.advice
  } else if (lower.includes('remind') || lower.includes('remember') || lower.includes('don\'t forget')) {
    pool = COMPANION_RESPONSES.reminder
  }

  return pool[Math.floor(Math.random() * pool.length)]
}

function generateAiReflection(journalText: string): string {
  const reflections = [
    'I notice themes of self-awareness and growth in your words. The patterns suggest you\'re navigating a period of meaningful transition. Consider: what would your future self thank you for doing today?',
    'Your reflection reveals a mind attuned to nuance — that\'s a gift. The tension you describe between what is and what could be is the birthplace of insight. Sit with that tension; it has something to teach.',
    'Reading this, I sense both courage and vulnerability. That combination is rare and powerful. The Stoics would say you\'re practicing the cardinal virtue of wisdom — seeing things as they are, not as you fear them to be.',
    'There\'s a thread of resilience woven through these words. Even in uncertainty, you\'re showing up. That\'s not small — it\'s the entire practice. Your emotional range here speaks to depth, not fragility.',
  ]
  return reflections[Math.floor(Math.random() * reflections.length)]
}

/* ═══════════════════════════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/70 backdrop-blur-md border border-slate-200/60 shadow-sm rounded-2xl ${className}`}>
      {children}
    </div>
  )
}

function TierBadge({ tier }: { tier: Tier }) {
  const config = {
    free: 'bg-slate-100 text-slate-600 border-slate-200',
    pro: 'bg-primary/10 text-primary border-primary/30',
  }
  const label = { free: 'Free', pro: 'Pro · $4.99/mo' }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${config[tier]}`}>
      {tier === 'pro' ? <Crown className="w-3 h-3" /> : <Compass className="w-3 h-3" />}
      {label[tier]}
    </span>
  )
}

function XpBar({ xp, level }: { xp: number; level: number }) {
  const xpForNext = level * 500
  const currentXp = xp - ((level - 1) * 500)
  const pct = Math.min(100, Math.round((currentXp / xpForNext) * 100))
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Lv.{level}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-chart-4"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{currentXp}/{xpForNext} XP</span>
    </div>
  )
}

function MoodIcon({ mood }: { mood: 'happy' | 'neutral' | 'sad' }) {
  const icons = { happy: Smile, neutral: Meh, sad: Frown }
  const colors = { happy: 'text-amber-500', neutral: 'text-slate-400', sad: 'text-blue-500' }
  const Icon = icons[mood]
  return <Icon className={`w-4 h-4 ${colors[mood]}`} />
}

/* ═══════════════════════════════════════════════════════════════
   ONBOARDING OVERLAY
   ═══════════════════════════════════════════════════════════════ */

function Onboarding({ state, setState, onComplete }: { state: AppState; setState: (s: AppState) => void; onComplete: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(state.companion.name)
  const [persona, setPersona] = useState<CompanionPersona>(state.companion.persona)
  const [aura, setAura] = useState<AuraMood>(state.companion.aura)

  const finish = () => {
    const updated = { ...state, onboardingDone: true, companion: { name, persona, aura } }
    setState(updated)
    onComplete()
  }

  const steps = [
    {
      title: 'Welcome to Your Sanctuary',
      subtitle: 'A space for cognitive sovereignty, intentional living, and mindful growth.',
      content: (
        <div className="text-center space-y-6 py-8">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-primary/30 via-accent/20 to-primary/10 flex items-center justify-center"
          >
            <Compass className="w-12 h-12 text-primary" />
          </motion.div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
              Reframe stress. Cultivate clarity. Your journey toward a more intentional life begins here — with a companion who understands.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Meet Your AI Companion',
      subtitle: 'Customize the guide who will walk beside you.',
      content: (
        <div className="space-y-5 py-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Companion Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1.5 w-full px-4 py-3 rounded-xl border border-border bg-white/80 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
              placeholder="e.g. Aria, Sol, Nova"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Persona</label>
            <div className="mt-1.5 grid gap-2">
              {(Object.entries(PERSONAS) as [CompanionPersona, typeof PERSONAS[keyof typeof PERSONAS]][]).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setPersona(k)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    persona === k ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-white/60 hover:bg-white/90'
                  }`}
                >
                  <span className="text-xl">{v.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{v.label}</p>
                    <p className="text-[11px] text-muted-foreground">{v.desc}</p>
                  </div>
                  {persona === k && <Check className="w-4 h-4 text-primary ml-auto shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Choose Your Aura',
      subtitle: 'Set the ambient mood for your sanctuary.',
      content: (
        <div className="grid gap-3 py-4">
          {(Object.entries(AURAS) as [AuraMood, typeof AURAS[keyof typeof AURAS]][]).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setAura(k)}
              className={`relative p-4 rounded-xl border text-left transition-all overflow-hidden ${
                aura === k ? 'border-primary shadow-sm ring-2 ring-primary/20' : 'border-border hover:bg-white/80'
              }`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${v.gradient} opacity-30`} />
              <div className="relative flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${v.gradient} border border-slate-200/60`} />
                <div>
                  <p className="text-sm font-semibold text-foreground">{v.label}</p>
                  <p className="text-[11px] text-muted-foreground">{v.desc}</p>
                </div>
                {aura === k && <Check className="w-4 h-4 text-primary ml-auto shrink-0" />}
              </div>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: 'Unlock Your Full Potential',
      subtitle: 'Start your 7-day free trial of Sovereign Pro.',
      content: (
        <div className="space-y-4 py-4">
          <GlassCard className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-primary" />
              <span className="font-bold text-foreground">Sovereign Pro — 7-Day Free Trial</span>
            </div>
            <p className="text-xs text-muted-foreground">$0 today. Cancel anytime. Full access to:</p>
            <ul className="space-y-2 text-xs text-foreground">
              {['Unlimited AI Companion interactions', 'AI Reflection & Analysis on all journal entries', 'Custom Soundscape Mixer', 'Full AI Soul Reports', 'Exclusive Badges & Themes'].map((f, i) => (
                <li key={i} className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-primary shrink-0" />{f}</li>
              ))}
            </ul>
          </GlassCard>
          <div className="grid gap-2">
            <button
              onClick={() => {
                const updated = { ...state, tier: 'pro' as Tier, trialActive: true, trialStartDate: new Date().toISOString(), aiInteractionsRemaining: 9999 }
                setState(updated)
                finish()
              }}
              className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Activate 7-Day Free Trial — $0 Today
            </button>
            <button onClick={finish} className="w-full py-3 px-4 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Continue with Limited Free Plan
            </button>
          </div>
        </div>
      ),
    },
  ]

  const currentStep = steps[step]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/60 overflow-hidden"
      >
        {/* Step indicators */}
        <div className="flex gap-1.5 px-6 pt-6">
          {steps.map((_, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        <div className="p-6 pt-4">
          <h2 className="text-xl font-bold text-foreground tracking-tight">{currentStep.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{currentStep.subtitle}</p>
          {currentStep.content}
        </div>

        <div className="flex items-center justify-between px-6 pb-6 pt-2">
          <button
            onClick={() => step > 0 ? setStep(step - 1) : finish()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {step > 0 ? '← Back' : 'Skip'}
          </button>
          <button
            onClick={() => step < steps.length - 1 ? setStep(step + 1) : finish()}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            {step < steps.length - 1 ? <>Next <ChevronRight className="w-4 h-4" /></> : 'Enter Sanctuary'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   UPGRADE MODAL
   ═══════════════════════════════════════════════════════════════ */

function UpgradeModal({ state, setState, onClose }: { state: AppState; setState: (s: AppState) => void; onClose: () => void }) {
  const upgrade = () => {
    const updated = { ...state, tier: 'pro' as Tier, trialActive: true, trialStartDate: new Date().toISOString(), aiInteractionsRemaining: 9999 }
    setState(updated)
    onClose()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/60 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">Upgrade Your Sanctuary</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
          </div>

          <div className="space-y-3">
            {/* Free Card */}
            <div className="p-4 rounded-2xl border border-border bg-muted/40 text-left">
              <Compass className="w-5 h-5 text-muted-foreground mb-2" />
              <p className="font-bold text-foreground text-sm">Free</p>
              <p className="text-2xl font-bold text-foreground mt-1">$0<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
              <ul className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
                <li className="flex items-center gap-1"><Check className="w-3 h-3" />Core AI Companion</li>
                <li className="flex items-center gap-1"><Check className="w-3 h-3" />Basic soundscapes</li>
                <li className="flex items-center gap-1"><Check className="w-3 h-3" />{FREE_AI_LIMIT} daily AI interactions</li>
              </ul>
            </div>

            {/* Pro Card */}
            <button
              onClick={upgrade}
              className="w-full p-4 rounded-2xl border-2 border-primary ring-2 ring-primary/20 bg-primary/5 text-left transition-all hover:bg-primary/10"
            >
              <Crown className="w-5 h-5 text-primary mb-2" />
              <p className="font-bold text-foreground text-sm">Pro</p>
              <p className="text-2xl font-bold text-foreground mt-1">${PRICING.pro.monthly}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
              <ul className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
                <li className="flex items-center gap-1"><Check className="w-3 h-3 text-primary" />Unlimited AI + long-term memory</li>
                <li className="flex items-center gap-1"><Check className="w-3 h-3 text-primary" />AI Reflections & Soul Reports</li>
                <li className="flex items-center gap-1"><Check className="w-3 h-3 text-primary" />Proactive coaching</li>
                <li className="flex items-center gap-1"><Check className="w-3 h-3 text-primary" />Custom Sound Mixer</li>
              </ul>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   CELEBRATION MODAL
   ═══════════════════════════════════════════════════════════════ */

function CelebrationModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/60 p-8 text-center"
      >
        <motion.div
          animate={{ rotate: [0, 10, -10, 10, 0], scale: [1, 1.2, 1.2, 1.2, 1] }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-amber-200 to-primary/30 flex items-center justify-center mb-4"
        >
          <Trophy className="w-10 h-10 text-primary" />
        </motion.div>
        <h2 className="text-xl font-bold text-foreground">Congratulations!</h2>
        <p className="text-sm text-muted-foreground mt-2">{message}</p>
        <button onClick={onClose} className="mt-6 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity">
          Continue
        </button>
      </motion.div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   HEADER
   ═══════════════════════════════════════════════════════════════ */

function AppHeader({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const [showSettings, setShowSettings] = useState(false)
  const [showPwaModal, setShowPwaModal] = useState(false)

  const installPwa = async () => {
    // Check for native install prompt
    const deferredPrompt = (window as any).__deferredPrompt
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const result = await deferredPrompt.userChoice
      if (result.outcome === 'accepted') setShowPwaModal(false)
      return
    }
    // iOS / manual instructions
    setShowPwaModal(true)
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center"
            >
              <Compass className="w-5 h-5 text-primary" />
            </motion.div>
            <span className="font-bold text-foreground tracking-tight text-lg">Thoughtica</span>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <TierBadge tier={state.tier} />
            {state.tier === 'free' && (
              <button onClick={() => setState({ ...state, tier: 'pro', trialActive: true, trialStartDate: new Date().toISOString(), aiInteractionsRemaining: 9999 })} className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity">
                <Crown className="w-3 h-3" />Try Pro Free
              </button>
            )}
            {/* Companion avatar badge */}
            <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-full">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/40 to-accent/30 flex items-center justify-center text-[10px] font-bold text-primary">
                {state.companion.name.charAt(0)}
              </div>
              <span className="text-xs font-semibold text-foreground hidden sm:inline">{state.companion.name}</span>
            </div>
            {/* PWA install */}
            <button onClick={installPwa} className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted">
              <Download className="w-3.5 h-3.5" />
              Install App
            </button>
            <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <Settings className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      {/* Settings Drawer */}
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-2xl border-l border-border p-6 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-foreground">Settings</h3>
                <button onClick={() => setShowSettings(false)} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Companion Name</label>
                  <input
                    value={state.companion.name}
                    onChange={e => setState({ ...state, companion: { ...state.companion, name: e.target.value } })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Streak</label>
                  <p className="text-sm mt-1 flex items-center gap-1.5"><Flame className="w-4 h-4 text-orange-500" />{state.streak} day{state.streak !== 1 ? 's' : ''}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tier</label>
                  <TierBadge tier={state.tier} />
                  {state.trialActive && <p className="text-[11px] text-muted-foreground mt-1">Trial active since {state.trialStartDate ? new Date(state.trialStartDate).toLocaleDateString() : 'today'}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">XP Progress</label>
                  <div className="mt-2"><XpBar xp={state.xp} level={state.level} /></div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Badges</label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {state.badges.map(b => (
                      <span key={b.id} className="px-2 py-0.5 bg-muted rounded-full text-[10px] font-medium text-muted-foreground">{b.name}</span>
                    ))}
                    {state.badges.length === 0 && <span className="text-[11px] text-muted-foreground">None yet — start your journey!</span>}
                  </div>
                </div>
                <hr className="border-border" />
                <button
                  onClick={() => { localStorage.clear(); window.location.reload() }}
                  className="text-xs text-destructive hover:underline"
                >
                  Reset All Data
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PWA Install Modal */}
      <AnimatePresence>
        {showPwaModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200/60 p-6">
              <h3 className="font-bold text-foreground text-lg">Install Thoughtica</h3>
              <p className="text-sm text-muted-foreground mt-2">
                {/iPhone|iPad|iPod/.test(navigator.userAgent)
                  ? 'Tap the Share button (↗) in Safari, then "Add to Home Screen".'
                  : 'Use your browser\'s menu to install this app on your device.'}
              </p>
              <button onClick={() => setShowPwaModal(false)} className="mt-4 w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm">Got it</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB 1: AI COMPANION CHAT
   ═══════════════════════════════════════════════════════════════ */

function CompanionTab({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [state.chatMessages, isTyping])

  const sendMessage = async (text: string) => {
    if (!text.trim()) return

    const canUseAi = state.tier !== 'free' || state.aiInteractionsRemaining > 0

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: text.trim(), timestamp: new Date().toISOString() }
    const withUser = { ...state, chatMessages: [...state.chatMessages, userMsg] }
    if (state.tier === 'free' && state.aiInteractionsRemaining > 0) {
      withUser.aiInteractionsRemaining = state.aiInteractionsRemaining - 1
    }
    setState(withUser)
    setInput('')

    if (!canUseAi) return

    setIsTyping(true)
    try {
      const rpgCtx: RpgContext = {
        level: state.level,
        xp: state.xp,
        streak: state.streak,
        activeQuestNames: state.pathMarkers.filter(p => !p.completed).map(p => p.text).slice(0, 5),
        recentBadgeNames: state.badges.slice(-3).map(b => b.name),
      }

      const result = await processCompanionTurn({
        userId: state.companion.name,
        userMessage: text.trim(),
        rpgContext: rpgCtx,
        topKMemories: 8,
      })

      // Apply any RPG action safely (XP only, capped at 200 per turn)
      let xpGain = 5
      if (result.sidecar.rpg_action?.type === 'xp_grant' && result.sidecar.rpg_action.xp) {
        xpGain = Math.min(200, result.sidecar.rpg_action.xp)
      }

      const companionMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'companion',
        text: result.reply,
        timestamp: new Date().toISOString(),
      }

      setState(prev => ({
        ...prev,
        chatMessages: [...prev.chatMessages, companionMsg],
        xp: prev.xp + xpGain,
      }))
    } catch {
      const fallbackMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'companion',
        text: 'I\'m having a quiet moment — your message is safe. Try again in a moment and I\'ll be fully present. 🌿',
        timestamp: new Date().toISOString(),
      }
      setState(prev => ({ ...prev, chatMessages: [...prev.chatMessages, fallbackMsg] }))
    } finally {
      setIsTyping(false)
    }
  }

  const quickActions = [
    { label: 'Request Advice', icon: Compass, text: 'I could use some advice right now.' },
    { label: 'Set Mindful Reminder', icon: Bell, text: 'Help me set a mindful reminder for today.' },
    { label: 'Deconstruct Stress', icon: Brain, text: 'I\'m feeling stressed and need to deconstruct it.' },
  ]

  const isOverLimit = state.tier === 'free' && state.aiInteractionsRemaining <= 0

  return (
    <div className="flex flex-col h-full">
      {/* Companion header */}
      <div className="shrink-0 p-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/40 to-accent/30 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">{state.companion.name}</h3>
            <p className="text-[11px] text-muted-foreground">{PERSONAS[state.companion.persona].label}</p>
          </div>
          {state.tier === 'free' && (
            <div className="ml-auto text-right">
              <p className="text-[11px] font-semibold text-muted-foreground">
                <span className={state.aiInteractionsRemaining <= 3 ? 'text-destructive' : 'text-primary'}>{state.aiInteractionsRemaining}</span>/{FREE_AI_LIMIT} interactions
              </p>
              <div className="w-24 h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${state.aiInteractionsRemaining <= 3 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${(state.aiInteractionsRemaining / FREE_AI_LIMIT) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {state.chatMessages.map(msg => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-muted text-foreground rounded-bl-md'
            }`}>
              {msg.text}
            </div>
          </motion.div>
        ))}
        {isTyping && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
            <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-muted text-muted-foreground text-sm flex items-center gap-1.5">
              <span className="animate-bounce delay-0 w-1.5 h-1.5 bg-muted-foreground rounded-full inline-block" />
              <span className="animate-bounce delay-100 w-1.5 h-1.5 bg-muted-foreground rounded-full inline-block" />
              <span className="animate-bounce delay-200 w-1.5 h-1.5 bg-muted-foreground rounded-full inline-block" />
            </div>
          </motion.div>
        )}
        {isOverLimit && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center p-4">
            <GlassCard className="p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground">Daily AI limit reached</p>
              <p className="text-xs text-muted-foreground">Upgrade to Pro for unlimited AI interactions.</p>
              <button
                onClick={() => setState({ ...state, tier: 'pro', trialActive: true, trialStartDate: new Date().toISOString(), aiInteractionsRemaining: 9999 })}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold"
              >
                Upgrade to Pro · $4.99/mo
              </button>
            </GlassCard>
          </motion.div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Quick actions */}
      <div className="shrink-0 px-4 pb-2 flex gap-2 overflow-x-auto">
        {quickActions.map((a, i) => (
          <button
            key={i}
            onClick={() => { void sendMessage(a.text) }}
            disabled={isOverLimit || isTyping}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-full text-[11px] font-medium text-foreground whitespace-nowrap transition-colors disabled:opacity-50"
          >
            <a.icon className="w-3 h-3" />{a.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="shrink-0 p-4 border-t border-border/60">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(input) } }}
            placeholder={isOverLimit ? 'Upgrade to continue...' : `Message ${state.companion.name}...`}
            disabled={isOverLimit || isTyping}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-white/80 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow disabled:opacity-50"
          />
          <button
            onClick={() => { void sendMessage(input) }}
            disabled={!input.trim() || isOverLimit || isTyping}
            className="p-2.5 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB 2: JOURNALING
   ═══════════════════════════════════════════════════════════════ */

function JournalTab({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const [text, setText] = useState('')
  const [mood, setMood] = useState<'happy' | 'neutral' | 'sad'>('neutral')
  const [aiLoading, setAiLoading] = useState(false)

  const saveEntry = () => {
    if (!text.trim()) return
    const entry: JournalEntry = { id: crypto.randomUUID(), text: text.trim(), mood, createdAt: new Date().toISOString() }
    const updated = { ...state, journalEntries: [entry, ...state.journalEntries], xp: state.xp + 15 }
    // Check first reflection badge
    if (updated.journalEntries.length === 1 && !updated.badges.find(b => b.id === 'first-reflection')) {
      updated.badges = [...updated.badges, { ...ALL_BADGES[0], unlockedAt: new Date().toISOString() }]
    }
    setState(updated)
    setText('')
    setMood('neutral')
  }

  const requestAiReflection = async (entryId: string) => {
    if (state.tier === 'free') {
      setState({ ...state, tier: 'pro', trialActive: true, trialStartDate: new Date().toISOString(), aiInteractionsRemaining: 9999 })
      return
    }
    setAiLoading(true)
    // simulate AI processing
    setTimeout(() => {
      const updated = { ...state }
      const entry = updated.journalEntries.find(e => e.id === entryId)
      if (entry) {
        entry.aiReflection = generateAiReflection(entry.text)
        updated.xp = state.xp + 20
      }
      setState(updated)
      setAiLoading(false)
    }, 1500)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Writing area */}
      <div className="shrink-0 p-4 border-b border-border/60 space-y-3">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="What's on your mind today? Pour your thoughts here..."
          className="w-full h-32 px-4 py-3 rounded-xl border border-border bg-white/80 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none transition-shadow"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {(['happy', 'neutral', 'sad'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMood(m)}
                className={`p-1.5 rounded-lg transition-all ${mood === m ? 'bg-muted shadow-sm' : 'hover:bg-muted/50'}`}
              >
                <MoodIcon mood={m} />
              </button>
            ))}
          </div>
          <button
            onClick={saveEntry}
            disabled={!text.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <PenLine className="w-4 h-4" />Save Entry
          </button>
        </div>
      </div>

      {/* Entries list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {state.journalEntries.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Your journal is empty. Begin your first reflection above.</p>
          </div>
        )}
        <AnimatePresence>
          {state.journalEntries.map(entry => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <GlassCard className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MoodIcon mood={entry.mood} />
                    <span className="text-[11px] text-muted-foreground">{new Date(entry.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <button
                    onClick={() => setState({ ...state, journalEntries: state.journalEntries.filter(e => e.id !== entry.id) })}
                    className="p-1 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{entry.text}</p>

                {entry.aiReflection ? (
                  <div className="mt-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[11px] font-semibold text-primary">AI Reflection</span>
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed">{entry.aiReflection}</p>
                  </div>
                ) : (
                  <button
                    onClick={() => requestAiReflection(entry.id)}
                    disabled={aiLoading}
                    className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline transition-colors"
                  >
                    {aiLoading ? (
                      <><RefreshCw className="w-3 h-3 animate-spin" />Analyzing...</>
                    ) : (
                      <><Sparkles className="w-3 h-3" />{state.tier === 'free' ? 'Unlock AI Reflection (Free Trial)' : 'Request AI Reflection'}</>
                    )}
                  </button>
                )}
              </GlassCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB 3: SOUNDSCAPES
   ═══════════════════════════════════════════════════════════════ */

function SoundscapesTab({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)

  const startSound = useCallback((freq: number, type: OscillatorType = 'sine') => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      if (oscillatorRef.current) {
        oscillatorRef.current.stop()
        oscillatorRef.current.disconnect()
      }
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, ctx.currentTime)
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.8)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      oscillatorRef.current = osc
      gainRef.current = gain
      // Add slight detune for richness
      osc.detune.setValueAtTime(3, ctx.currentTime)
    } catch {}
  }, [])

  const stopSound = useCallback(() => {
    if (gainRef.current && audioCtxRef.current) {
      gainRef.current.gain.linearRampToValueAtTime(0, audioCtxRef.current.currentTime + 0.3)
    }
    setTimeout(() => {
      if (oscillatorRef.current) {
        try { oscillatorRef.current.stop() } catch {}
        oscillatorRef.current = null
      }
    }, 400)
  }, [])

  const toggleSound = (presetId: string, freq: number) => {
    if (state.activeSoundscape === presetId) {
      stopSound()
      setState({ ...state, activeSoundscape: null })
    } else {
      const type = presetId === 'binaural' ? 'sine' : presetId === 'hearth' ? 'sawtooth' : 'triangle'
      startSound(freq, type)
      setState({ ...state, activeSoundscape: presetId })
    }
  }

  useEffect(() => () => { stopSound() }, [stopSound])

  const isPro = state.tier !== 'free'

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      <div>
        <h3 className="font-bold text-foreground text-sm flex items-center gap-2"><Music className="w-4 h-4 text-primary" />Ambient Presets</h3>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {SOUND_PRESETS.map(p => {
            const active = state.activeSoundscape === p.id
            return (
              <button
                key={p.id}
                onClick={() => toggleSound(p.id, p.freq)}
                className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                  active ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-white/60 hover:bg-white/90'
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${active ? 'bg-primary/20' : 'bg-muted'}`}>
                  {active ? <Pause className="w-4 h-4 text-primary" /> : <Play className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">{active ? 'Playing...' : 'Tap to play'}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Custom Mixer — pro only */}
      <div>
        <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-primary" />
          Custom Soundscape Mixer
          {!isPro && <span className="text-[10px] text-muted-foreground font-normal ml-auto"><Crown className="w-3 h-3 inline" /> Pro</span>}
        </h3>
        {isPro ? (
          <GlassCard className="p-4 mt-3 space-y-3">
            {Object.entries(state.soundMix).map(([key, val]) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground capitalize">{key}</span>
                  <span className="text-[10px] text-muted-foreground">{val}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={val}
                  onChange={e => setState({ ...state, soundMix: { ...state.soundMix, [key]: parseInt(e.target.value) } })}
                  className="w-full h-1.5 accent-primary rounded-full appearance-none bg-muted cursor-pointer"
                />
              </div>
            ))}
          </GlassCard>
        ) : (
          <button
            onClick={() => setState({ ...state, tier: 'pro', trialActive: true, trialStartDate: new Date().toISOString(), aiInteractionsRemaining: 9999 })}
            className="w-full mt-3 p-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 text-center hover:bg-primary/10 transition-colors"
          >
            <p className="text-sm font-semibold text-primary">Unlock Custom Mixer</p>
            <p className="text-[11px] text-muted-foreground mt-1">Start your 7-day free trial</p>
          </button>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB 4: RITUALS & GAMIFICATION
   ═══════════════════════════════════════════════════════════════ */

function RitualsTab({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const [newTask, setNewTask] = useState('')
  const [intentionInput, setIntentionInput] = useState(state.intention)
  const [celebration, setCelebration] = useState<string | null>(null)

  const addTask = () => {
    if (!newTask.trim()) return
    const marker: PathMarker = { id: crypto.randomUUID(), text: newTask.trim(), completed: false, createdAt: new Date().toISOString() }
    setState({ ...state, pathMarkers: [...state.pathMarkers, marker] })
    setNewTask('')
  }

  const completeTask = (id: string) => {
    const updated = { ...state }
    const marker = updated.pathMarkers.find(m => m.id === id)
    if (marker) {
      marker.completed = !marker.completed
      if (marker.completed) {
        updated.xp = state.xp + XP_PER_TASK
        // Check path clearer badge
        const completedCount = updated.pathMarkers.filter(m => m.completed).length
        if (completedCount >= 10 && !updated.badges.find(b => b.id === 'path-clearer')) {
          updated.badges = [...updated.badges, { ...ALL_BADGES[4], unlockedAt: new Date().toISOString() }]
          setCelebration('Path Clearer badge unlocked!')
        }
      }
    }
    setState(updated)
  }

  const deleteTask = (id: string) => {
    setState({ ...state, pathMarkers: state.pathMarkers.filter(m => m.id !== id) })
  }

  const saveIntention = () => {
    if (!intentionInput.trim()) return
    const updated = { ...state, intention: intentionInput.trim(), xp: state.xp + XP_PER_INTENTION }
    setState(updated)
    setIntentionInput('')
  }

  const checkLevelUp = () => {
    const newLevel = Math.floor(state.xp / 500) + 1
    if (newLevel > state.level) {
      const updated = { ...state, level: newLevel }
      if (newLevel >= 5 && !updated.badges.find(b => b.id === 'zen-master')) {
        updated.badges = [...updated.badges, { ...ALL_BADGES[2], unlockedAt: new Date().toISOString() }]
        setCelebration('Zen Master badge unlocked! You reached Level 5!')
      }
      setState(updated)
    }
  }

  useEffect(() => { checkLevelUp() }, [state.xp])

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-5">
      {celebration && <CelebrationModal message={celebration} onClose={() => setCelebration(null)} />}

      {/* XP & Level */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-foreground text-sm flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" />Your Progress</h3>
          <span className="text-[10px] font-medium text-muted-foreground">🔥 {state.streak} day streak</span>
        </div>
        <XpBar xp={state.xp} level={state.level} />
        <p className="text-[11px] text-muted-foreground mt-2">Level {state.level}: {['Novice', 'Practitioner', 'Mindful Monk', 'Sage Adept', 'Zen Master', 'Enlightened'][Math.min(state.level - 1, 5)]}</p>
      </GlassCard>

      {/* Badges */}
      <GlassCard className="p-4">
        <h3 className="font-bold text-foreground text-sm flex items-center gap-2 mb-3"><Star className="w-4 h-4 text-primary" />Badges</h3>
        <div className="grid grid-cols-3 gap-2">
          {ALL_BADGES.map(b => {
            const unlocked = state.badges.find(ub => ub.id === b.id)
            return (
              <div key={b.id} className={`p-2.5 rounded-xl border text-center transition-all ${unlocked ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/30 opacity-50'}`}>
                <div className="text-lg mb-1">{unlocked ? '🏆' : '🔒'}</div>
                <p className="text-[10px] font-semibold text-foreground leading-tight">{b.name}</p>
              </div>
            )
          })}
        </div>
      </GlassCard>

      {/* Path Markers */}
      <GlassCard className="p-4">
        <h3 className="font-bold text-foreground text-sm flex items-center gap-2 mb-3"><Target className="w-4 h-4 text-primary" />Path Markers</h3>
        <div className="flex items-center gap-2 mb-3">
          <input
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTask() }}
            placeholder="Add a daily intention..."
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-white/80 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button onClick={addTask} className="p-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"><Plus className="w-4 h-4" /></button>
        </div>
        {state.pathMarkers.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No path markers yet. Add your first task above.</p>}
        <div className="space-y-1.5">
          {state.pathMarkers.map(m => (
            <div key={m.id} className={`flex items-center gap-2 p-2.5 rounded-lg transition-all ${m.completed ? 'bg-primary/5' : 'bg-white/60'}`}>
              <button
                onClick={() => completeTask(m.id)}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${m.completed ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`}
              >
                {m.completed && <Check className="w-3 h-3 text-primary-foreground" />}
              </button>
              <span className={`flex-1 text-sm ${m.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{m.text}</span>
              <span className="text-[10px] text-muted-foreground">+{XP_PER_TASK}XP</span>
              <button onClick={() => deleteTask(m.id)} className="p-0.5 hover:bg-muted rounded transition-colors"><Trash2 className="w-3 h-3 text-muted-foreground" /></button>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Word of Day & Intention */}
      <GlassCard className="p-4">
        <h3 className="font-bold text-foreground text-sm flex items-center gap-2 mb-3"><Quote className="w-4 h-4 text-primary" />Word of the Day</h3>
        <p className="text-lg font-bold text-foreground">{state.wordOfDay.word}</p>
        <p className="text-xs text-muted-foreground mt-1">{state.wordOfDay.definition}</p>
        <div className="mt-4 space-y-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Today's Intention (+{XP_PER_INTENTION} XP)</label>
          <div className="flex items-center gap-2">
            <input
              value={intentionInput}
              onChange={e => setIntentionInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveIntention() }}
              placeholder="e.g. I will approach today with curiosity..."
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-white/80 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button onClick={saveIntention} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:opacity-90">Set</button>
          </div>
          {state.intention && <p className="text-xs text-primary font-medium italic mt-1">"{state.intention}"</p>}
        </div>
      </GlassCard>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB 5: SOUL REPORTS
   ═══════════════════════════════════════════════════════════════ */

function ReportsTab({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const isPro = state.tier !== 'free'

  const totalTasks = state.pathMarkers.filter(m => m.completed).length
  const totalEntries = state.journalEntries.length
  const moodCounts = { happy: state.journalEntries.filter(e => e.mood === 'happy').length, neutral: state.journalEntries.filter(e => e.mood === 'neutral').length, sad: state.journalEntries.filter(e => e.mood === 'sad').length }
  const dominantMood = moodCounts.happy >= moodCounts.neutral && moodCounts.happy >= moodCounts.sad ? 'Positive' : moodCounts.sad >= moodCounts.neutral ? 'Reflective' : 'Balanced'

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      {/* Basic stats — always available */}
      <GlassCard className="p-4">
        <h3 className="font-bold text-foreground text-sm flex items-center gap-2 mb-4"><BarChart3 className="w-4 h-4 text-primary" />Your Journey at a Glance</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-muted/50">
            <p className="text-2xl font-bold text-foreground">{totalEntries}</p>
            <p className="text-[10px] text-muted-foreground">Entries</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-muted/50">
            <p className="text-2xl font-bold text-foreground">{totalTasks}</p>
            <p className="text-[10px] text-muted-foreground">Tasks Done</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-muted/50">
            <p className="text-2xl font-bold text-foreground">{state.streak}</p>
            <p className="text-[10px] text-muted-foreground">Day Streak</p>
          </div>
        </div>
      </GlassCard>

      {/* Mood distribution */}
      <GlassCard className="p-4">
        <h3 className="font-bold text-foreground text-sm mb-3">Emotional Sentiment</h3>
        {totalEntries > 0 ? (
          <>
            <div className="space-y-2">
              {(['happy', 'neutral', 'sad'] as const).map(m => {
                const count = moodCounts[m]
                const pct = totalEntries > 0 ? Math.round((count / totalEntries) * 100) : 0
                const colors = { happy: 'bg-amber-400', neutral: 'bg-slate-400', sad: 'bg-blue-400' }
                return (
                  <div key={m} className="flex items-center gap-2">
                    <MoodIcon mood={m} />
                    <span className="text-xs text-foreground capitalize w-14">{m}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div className={`h-full rounded-full ${colors[m]}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Dominant tone: <span className="font-semibold text-foreground">{dominantMood}</span></p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">Start journaling to see your emotional trends.</p>
        )}
      </GlassCard>

      {/* Pro AI Soul Report */}
      {isPro ? (
        <GlassCard className="p-4 bg-gradient-to-br from-primary/5 to-accent/5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-foreground text-sm">Weekly Soul Report</h3>
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed">
            Your cognitive patterns this week show a growing capacity for self-reflection. 
            You've been processing themes of growth and acceptance. Your primary stress trigger 
            appears related to uncertainty — a common marker of high awareness individuals. 
            Recommendation: continue your journaling practice, and try the "Deconstruct Stress" 
            quick action with {state.companion.name} when you feel tension building.
          </p>
          <div className="mt-4 p-3 rounded-xl bg-white/60 border border-slate-200/60">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Shareable Cognitive Snapshot</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div><span className="text-muted-foreground">Mood:</span> <span className="font-semibold text-foreground">{dominantMood}</span></div>
              <div><span className="text-muted-foreground">Level:</span> <span className="font-semibold text-foreground">{state.level}</span></div>
              <div><span className="text-muted-foreground">Streak:</span> <span className="font-semibold text-foreground">{state.streak} days</span></div>
              <div><span className="text-muted-foreground">Companion:</span> <span className="font-semibold text-foreground">{state.companion.name}</span></div>
            </div>
            <button className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-primary hover:underline">
              <Download className="w-3 h-3" />Export & Share
            </button>
          </div>
        </GlassCard>
      ) : (
        <button
          onClick={() => setState({ ...state, tier: 'pro', trialActive: true, trialStartDate: new Date().toISOString(), aiInteractionsRemaining: 9999 })}
          className="w-full p-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 text-center hover:bg-primary/10 transition-colors"
        >
          <Sparkles className="w-5 h-5 text-primary mx-auto mb-2" />
          <p className="text-sm font-semibold text-primary">Unlock Full AI Soul Reports</p>
          <p className="text-[11px] text-muted-foreground mt-1">Get weekly cognitive insights, emotional trends, and life optimizations.</p>
          <p className="text-xs font-semibold text-primary mt-2">Start 7-Day Free Trial →</p>
        </button>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════════════ */

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'companion', label: 'Companion', icon: Sparkles },
  { id: 'journal', label: 'Journal', icon: PenLine },
  { id: 'relax', label: 'Relax', icon: Wind },
  { id: 'soundtrack', label: 'Soundtrack', icon: Music },
  { id: 'detox', label: 'Detox', icon: Timer },
  { id: 'rituals', label: 'Rituals', icon: Target },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
]

function Dashboard({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const [activeTab, setActiveTab] = useState<TabId>('companion')
  const [showUpgrade, setShowUpgrade] = useState(false)

  const isPro = state.tier !== 'free'

  const tabContent = () => {
    switch (activeTab) {
      case 'companion': return <CompanionTab state={state} setState={setState} />
      case 'journal': return <JournalTab state={state} setState={setState} />
      case 'relax': return <RelaxTab />
      case 'soundscapes': return <SoundscapesTab state={state} setState={setState} />
      case 'soundtrack': return <SoundtrackTab />
      case 'detox': return <DetoxTab />
      case 'rituals': return <RitualsTab state={state} setState={setState} />
      case 'reports': return <ReportsTab state={state} setState={setState} />
    }
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100dvh-3.5rem)]">
      {/* Desktop sidebar tabs */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-border/60 bg-white/40 backdrop-blur-sm p-3 gap-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-primary/10 text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
        <div className="mt-auto pt-3 border-t border-border/60">
          {!isPro && (
            <button onClick={() => setShowUpgrade(true)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
              <Crown className="w-4 h-4" />Upgrade
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 flex flex-col min-h-0 relative overflow-hidden bg-gradient-to-br ${AURA_GRADIENTS[state.companion.aura]}`}>
        {tabContent()}

        {/* Floating upgrade FAB for mobile */}
        {!isPro && (
          <button
            onClick={() => setShowUpgrade(true)}
            className="lg:hidden fixed bottom-20 right-4 z-30 p-3 bg-primary text-primary-foreground rounded-full shadow-lg hover:opacity-90 transition-opacity"
          >
            <Crown className="w-5 h-5" />
          </button>
        )}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden shrink-0 bg-white/80 backdrop-blur-xl border-t border-border/60 px-2 py-1.5 flex items-center justify-around">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
              activeTab === tab.id ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <tab.icon className="w-5 h-5" />
            <span className="text-[9px] font-medium">{tab.label}</span>
          </button>
        ))}
      </nav>

      {showUpgrade && <UpgradeModal state={state} setState={setState} onClose={() => setShowUpgrade(false)} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ROUTE ENTRY — Client-only (localStorage)
   ═══════════════════════════════════════════════════════════════ */

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Thoughtica · Mind Sanctuary' },
      { name: 'description', content: 'Your AI-powered mindful companion for daily clarity, immersive journaling, ambient soundscapes, and cognitive sovereignty.' },
    ],
  }),
  component: Home,
})

function Home() {
  return (
    <BlinkClientBoundary fallback={<AppSkeleton />}>
      <ThoughticaApp />
    </BlinkClientBoundary>
  )
}

function AppSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center"
      >
        <Compass className="w-7 h-7 text-primary" />
      </motion.div>
    </div>
  )
}

function ThoughticaApp() {
  const [state, setStateInternal] = useState<AppState>(loadState)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const setState = useCallback((next: AppState) => {
    setStateInternal(next)
    saveState(next)
  }, [])

  // On mount, check if onboarding needed
  useEffect(() => {
    if (!state.onboardingDone) {
      const t = setTimeout(() => setShowOnboarding(true), 400)
      return () => clearTimeout(t)
    }
  }, [])

  // Streak tracking
  useEffect(() => {
    const today = todayStr()
    if (state.lastActiveDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      const streak = state.lastActiveDate === yesterday ? state.streak + 1 : 1
      const updated = { ...state, lastActiveDate: today, streak }
      // Check 7-day badge
      if (streak >= 7 && !updated.badges.find(b => b.id === '7-day-streak')) {
        updated.badges = [...updated.badges, { ...ALL_BADGES[1], unlockedAt: new Date().toISOString() }]
      }
      setState(updated)
    }
  }, [])

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    // Listen for beforeinstallprompt
    const handler = (e: Event) => { e.preventDefault(); (window as any).__deferredPrompt = e }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const finishOnboarding = () => {
    setShowOnboarding(false)
  }

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <AppHeader state={state} setState={setState} />

      {showOnboarding && !state.onboardingDone && (
        <Onboarding state={state} setState={setState} onComplete={finishOnboarding} />
      )}

      {state.onboardingDone && (
        <Dashboard state={state} setState={setState} />
      )}

      {!state.onboardingDone && !showOnboarding && (
        <div className="flex-1 flex items-center justify-center">
          <AppSkeleton />
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   CLIENT BOUNDARY (for SSR safety)
   ═══════════════════════════════════════════════════════════════ */

function BlinkClientBoundary({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  return mounted ? <>{children}</> : <>{fallback}</>
}
