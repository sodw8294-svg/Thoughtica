import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Brain, PenLine, Music, Target, BarChart3, MessageCircle,
  Heart, Moon, Sun, Zap, Trophy, Star, Crown, Check, ChevronRight,
  X, Settings, Plus, Trash2, Quote, BookOpen, Compass,
  Gem, Flame, Shield, Smile, Frown, Meh, Wind, type LucideIcon
} from 'lucide-react'
import { RelaxTab } from '@/components/RelaxTab'
import { SoundtrackTab } from '@/components/SoundtrackTab'
import { DetoxTab } from '@/components/DetoxTab'
import { CompanionChat } from '@/components/CompanionChat'
import { BlinkClientBoundary } from '@/components/BlinkClientBoundary'
import { blink } from '@/blink/client'
import { loadPersonality } from '@/lib/companion'
import type { RpgContext } from '@/lib/companion'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════
   TYPES & CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

type Tier = 'free' | 'pro'
type CompanionPersona = 'calm-philosopher' | 'gentle-strategist' | 'socratic-mentor'
type AuraMood = 'dawn-mist' | 'sage-sanctuary' | 'twilight-solitude'
type TabId = 'companion' | 'journal' | 'relax' | 'soundscapes' | 'soundtrack' | 'detox' | 'rituals' | 'reports'

interface CompanionConfig { name: string; persona: CompanionPersona; aura: AuraMood }
interface JournalEntry { id: string; text: string; mood: 'happy' | 'neutral' | 'sad'; createdAt: string; aiReflection?: string }
interface PathMarker { id: string; text: string; completed: boolean; createdAt: string }
interface Badge { id: string; name: string; description: string; icon: string; unlockedAt?: string }

interface AppState {
  onboardingDone: boolean
  companion: CompanionConfig
  tier: Tier
  xp: number
  level: number
  streak: number
  lastActiveDate: string | null
  journalEntries: JournalEntry[]
  pathMarkers: PathMarker[]
  intention: string
  wordOfDay: { word: string; definition: string; date: string }
  badges: Badge[]
  activeQuests: string[]
}

const PERSONAS: Record<CompanionPersona, { label: string; desc: string; emoji: string }> = {
  'calm-philosopher': { label: 'The Calm Philosopher', desc: 'Gentle wisdom rooted in stoic tranquility.', emoji: '🏛️' },
  'gentle-strategist': { label: 'The Gentle Strategist', desc: 'Practical clarity with compassionate guidance.', emoji: '🧭' },
  'socratic-mentor': { label: 'The Socratic Mentor', desc: 'Provocative questions that unlock insight.', emoji: '🦉' },
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
  { id: '7-day-streak', name: '7-Day Streak Master', description: 'Maintained a 7-day streak.', icon: 'Flame' },
  { id: 'zen-master', name: 'Zen Master', description: 'Reached Level 5 in your journey.', icon: 'Trophy' },
  { id: 'sound-explorer', name: 'Sound Explorer', description: 'Tried all four soundscapes.', icon: 'Music' },
  { id: 'path-clearer', name: 'Path Clearer', description: 'Completed 10 path markers.', icon: 'Target' },
  { id: 'ai-bond', name: 'AI Bond', description: 'Had 50 conversations with your companion.', icon: 'Sparkles' },
]

const XP_PER_LEVEL = 500
const XP_PER_INTENTION = 25
const XP_PER_PATH_MARKER = 50
const XP_PER_JOURNAL = 30
const STORAGE_KEY = 'thoughtica-app-state-v2'

function todayStr() { return new Date().toISOString().split('T')[0] }

function pickWordOfDay(): { word: string; definition: string; date: string } {
  const today = todayStr()
  const idx = new Date().getDate() % WORDS_OF_DAY.length
  return { ...WORDS_OF_DAY[idx], date: today }
}

function getDefaultState(): AppState {
  return {
    onboardingDone: false,
    companion: { name: 'Kora', persona: 'calm-philosopher', aura: 'sage-sanctuary' },
    tier: 'free',
    xp: 0,
    level: 1,
    streak: 0,
    lastActiveDate: null,
    journalEntries: [],
    pathMarkers: [],
    intention: '',
    wordOfDay: pickWordOfDay(),
    badges: [],
    activeQuests: [],
  }
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultState()
    return { ...getDefaultState(), ...JSON.parse(raw) }
  } catch {
    return getDefaultState()
  }
}

function saveState(s: AppState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* no-op */ }
}

function calcLevel(xp: number) { return Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1) }

/* ═══════════════════════════════════════════════════════════════
   BADGE ICON MAP
   ═══════════════════════════════════════════════════════════════ */

const BADGE_ICONS: Record<string, LucideIcon> = {
  BookOpen, Flame, Trophy, Music, Target, Sparkles, Shield, Star, Crown, Gem, Compass,
}

function BadgeIcon({ name, className }: { name: string; className?: string }) {
  const Icon = BADGE_ICONS[name] ?? Star
  return <Icon className={className} />
}

/* ═══════════════════════════════════════════════════════════════
   ONBOARDING
   ═══════════════════════════════════════════════════════════════ */

interface OnboardingProps {
  onComplete: (name: string, persona: CompanionPersona, aura: AuraMood) => void
}

function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [persona, setPersona] = useState<CompanionPersona>('calm-philosopher')
  const [aura, setAura] = useState<AuraMood>('sage-sanctuary')

  const auraOptions: { id: AuraMood; label: string; gradient: string }[] = [
    { id: 'dawn-mist', label: 'Dawn Mist', gradient: 'from-purple-200 to-amber-100' },
    { id: 'sage-sanctuary', label: 'Sage Sanctuary', gradient: 'from-emerald-200 to-teal-100' },
    { id: 'twilight-solitude', label: 'Twilight Solitude', gradient: 'from-indigo-200 to-sky-100' },
  ]

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background p-4">
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        className="w-full max-w-md"
      >
        {step === 0 && (
          <div className="text-center space-y-6">
            <div className="text-5xl">✨</div>
            <div>
              <h1 className="text-2xl font-serif font-semibold">Welcome to Thoughtica</h1>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                Your AI-powered mindfulness sanctuary for daily clarity, growth, and peace.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-left block">What should Kora call you?</label>
              <input
                className="w-full border border-input rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 bg-background"
                placeholder="Your name…"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && name.trim() && setStep(1)}
                autoFocus
              />
            </div>
            <button
              onClick={() => name.trim() && setStep(1)}
              disabled={!name.trim()}
              className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-medium disabled:opacity-40 transition-opacity"
            >
              Continue →
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-serif font-semibold">Choose your companion style</h2>
              <p className="text-muted-foreground text-sm mt-1">How would you like Kora to guide you?</p>
            </div>
            <div className="space-y-3">
              {(Object.entries(PERSONAS) as [CompanionPersona, typeof PERSONAS[CompanionPersona]][]).map(([id, p]) => (
                <button
                  key={id}
                  onClick={() => setPersona(id)}
                  className={cn(
                    'w-full text-left border rounded-xl px-4 py-3 transition-all',
                    persona === id
                      ? 'border-primary bg-primary/8 dark:bg-primary/15'
                      : 'border-border hover:border-primary/40 hover:bg-muted/40'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{p.emoji}</span>
                    <div>
                      <div className="text-sm font-medium">{p.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{p.desc}</div>
                    </div>
                    {persona === id && <Check className="ml-auto w-4 h-4 text-primary" />}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(0)} className="flex-1 border border-border rounded-xl py-2.5 text-sm">Back</button>
              <button onClick={() => setStep(2)} className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-medium">Continue →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-serif font-semibold">Choose your sanctuary aura</h2>
              <p className="text-muted-foreground text-sm mt-1">Sets the visual mood of your space.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {auraOptions.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setAura(opt.id)}
                  className={cn(
                    'rounded-xl h-20 bg-gradient-to-br flex items-end p-2 text-[10px] font-medium transition-all',
                    opt.gradient,
                    aura === opt.id ? 'ring-2 ring-primary ring-offset-2' : 'opacity-70 hover:opacity-100'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 border border-border rounded-xl py-2.5 text-sm">Back</button>
              <button
                onClick={() => onComplete(name.trim(), persona, aura)}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-medium"
              >
                Enter sanctuary ✨
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   JOURNAL TAB
   ═══════════════════════════════════════════════════════════════ */

interface JournalTabProps {
  entries: JournalEntry[]
  onAddEntry: (text: string, mood: JournalEntry['mood']) => void
  onDeleteEntry: (id: string) => void
}

function JournalTab({ entries, onAddEntry, onDeleteEntry }: JournalTabProps) {
  const [draft, setDraft] = useState('')
  const [mood, setMood] = useState<JournalEntry['mood']>('neutral')

  function submit() {
    if (!draft.trim()) return
    onAddEntry(draft.trim(), mood)
    setDraft('')
    setMood('neutral')
  }

  const moodOptions: { id: JournalEntry['mood']; icon: LucideIcon; label: string; color: string }[] = [
    { id: 'happy', icon: Smile, label: 'Good', color: 'text-emerald-500' },
    { id: 'neutral', icon: Meh, label: 'Okay', color: 'text-amber-500' },
    { id: 'sad', icon: Frown, label: 'Hard', color: 'text-rose-500' },
  ]

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto w-full px-4 py-5">
      {/* Entry composer */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <PenLine className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">New entry</span>
          <span className="ml-auto text-xs text-muted-foreground">{new Date().toLocaleDateString()}</span>
        </div>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="What's on your mind today…"
          rows={4}
          className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring/40 placeholder:text-muted-foreground/50"
        />
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {moodOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setMood(opt.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all',
                  mood === opt.id
                    ? 'border-primary bg-primary/8 dark:bg-primary/15 font-medium'
                    : 'border-border hover:border-primary/40'
                )}
              >
                <opt.icon className={cn('w-3.5 h-3.5', mood === opt.id ? opt.color : 'text-muted-foreground')} />
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={submit}
            disabled={!draft.trim()}
            className="bg-primary text-primary-foreground rounded-xl px-4 py-1.5 text-sm font-medium disabled:opacity-40 transition-opacity"
          >
            Save (+{XP_PER_JOURNAL} XP)
          </button>
        </div>
      </div>

      {/* Entries list */}
      <div className="space-y-3">
        {entries.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-10">
            <Quote className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p>Your journal is empty. Write your first entry above.</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {entries.slice().reverse().map(entry => {
            const moodOpt = moodOptions.find(m => m.id === entry.mood) ?? moodOptions[1]
            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="rounded-2xl border border-border bg-card p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <moodOpt.icon className={cn('w-4 h-4', moodOpt.color)} />
                  <span className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <button
                    onClick={() => onDeleteEntry(entry.id)}
                    className="ml-auto text-muted-foreground/50 hover:text-destructive transition-colors"
                    aria-label="Delete entry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{entry.text}</p>
                {entry.aiReflection && (
                  <div className="border-t border-border pt-2 mt-2">
                    <p className="text-xs text-muted-foreground italic leading-relaxed">{entry.aiReflection}</p>
                  </div>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   RITUALS TAB (Path Markers / Intention)
   ═══════════════════════════════════════════════════════════════ */

interface RitualsTabProps {
  pathMarkers: PathMarker[]
  intention: string
  onSetIntention: (text: string) => void
  onAddMarker: (text: string) => void
  onCompleteMarker: (id: string) => void
  onDeleteMarker: (id: string) => void
}

function RitualsTab({ pathMarkers, intention, onSetIntention, onAddMarker, onCompleteMarker, onDeleteMarker }: RitualsTabProps) {
  const [markerDraft, setMarkerDraft] = useState('')
  const [intentionDraft, setIntentionDraft] = useState(intention)

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto w-full px-4 py-5">
      {/* Daily intention */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sun className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium">Today's intention</span>
          {intention && <span className="ml-auto text-xs text-emerald-500">+{XP_PER_INTENTION} XP set</span>}
        </div>
        <input
          value={intentionDraft}
          onChange={e => setIntentionDraft(e.target.value)}
          placeholder="I intend to…"
          className="w-full border border-input rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 bg-background placeholder:text-muted-foreground/50"
        />
        <button
          onClick={() => { if (intentionDraft.trim()) onSetIntention(intentionDraft.trim()) }}
          disabled={!intentionDraft.trim() || intentionDraft.trim() === intention}
          className="bg-primary text-primary-foreground rounded-xl px-4 py-1.5 text-sm font-medium disabled:opacity-40 transition-opacity w-full"
        >
          Set intention (+{XP_PER_INTENTION} XP)
        </button>
      </div>

      {/* Path markers */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Path markers</span>
          <span className="ml-auto text-xs text-muted-foreground">{pathMarkers.filter(m => m.completed).length}/{pathMarkers.length} complete</span>
        </div>
        <div className="flex gap-2">
          <input
            value={markerDraft}
            onChange={e => setMarkerDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && markerDraft.trim() && (onAddMarker(markerDraft.trim()), setMarkerDraft(''))}
            placeholder="Add a milestone or habit…"
            className="flex-1 border border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 bg-background placeholder:text-muted-foreground/50"
          />
          <button
            onClick={() => { if (markerDraft.trim()) { onAddMarker(markerDraft.trim()); setMarkerDraft('') } }}
            className="bg-primary text-primary-foreground rounded-xl px-3 py-2"
            aria-label="Add marker"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {pathMarkers.map(marker => (
            <motion.div
              key={marker.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors',
                marker.completed
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30'
                  : 'border-border hover:border-primary/30'
              )}
            >
              <button
                onClick={() => !marker.completed && onCompleteMarker(marker.id)}
                className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                  marker.completed
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-muted-foreground/30 hover:border-primary'
                )}
                aria-label={marker.completed ? 'Completed' : 'Mark as complete'}
              >
                {marker.completed && <Check className="w-3 h-3" />}
              </button>
              <span className={cn('text-sm flex-1', marker.completed && 'line-through text-muted-foreground')}>
                {marker.text}
              </span>
              {marker.completed && <span className="text-xs text-emerald-600 dark:text-emerald-400">+{XP_PER_PATH_MARKER} XP</span>}
              <button
                onClick={() => onDeleteMarker(marker.id)}
                className="text-muted-foreground/40 hover:text-destructive transition-colors"
                aria-label="Delete marker"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        {pathMarkers.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-4">Add milestones to track your path forward.</p>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   REPORTS TAB
   ═══════════════════════════════════════════════════════════════ */

interface ReportsTabProps {
  xp: number
  level: number
  streak: number
  journalEntries: JournalEntry[]
  badges: Badge[]
  pathMarkers: PathMarker[]
}

function ReportsTab({ xp, level, streak, journalEntries, badges, pathMarkers }: ReportsTabProps) {
  const xpInLevel = xp % XP_PER_LEVEL
  const xpProgress = Math.round((xpInLevel / XP_PER_LEVEL) * 100)
  const completedMarkers = pathMarkers.filter(m => m.completed).length
  const moodCounts = { happy: 0, neutral: 0, sad: 0 }
  journalEntries.slice(-30).forEach(e => moodCounts[e.mood]++)

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto w-full px-4 py-5">
      {/* XP & Level card */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Current level</div>
            <div className="text-3xl font-bold text-primary">Lvl {level}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total XP</div>
            <div className="text-2xl font-semibold">{xp.toLocaleString()}</div>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress to Level {level + 1}</span>
            <span>{xpInLevel} / {XP_PER_LEVEL} XP</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${xpProgress}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Streak', value: streak, unit: 'days', icon: Flame, color: 'text-orange-500' },
          { label: 'Journal entries', value: journalEntries.length, unit: 'total', icon: PenLine, color: 'text-blue-500' },
          { label: 'Path markers', value: completedMarkers, unit: 'completed', icon: Target, color: 'text-emerald-500' },
          { label: 'Badges', value: badges.length, unit: 'earned', icon: Trophy, color: 'text-amber-500' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card p-4">
            <stat.icon className={cn('w-5 h-5 mb-2', stat.color)} />
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Mood summary */}
      {journalEntries.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-500" />
            <span className="text-sm font-medium">Mood (last 30 entries)</span>
          </div>
          {(['happy', 'neutral', 'sad'] as const).map(mood => {
            const count = moodCounts[mood]
            const total = journalEntries.slice(-30).length
            const pct = total ? Math.round((count / total) * 100) : 0
            const colors = { happy: 'bg-emerald-400', neutral: 'bg-amber-400', sad: 'bg-rose-400' }
            const labels = { happy: 'Good', neutral: 'Okay', sad: 'Hard' }
            return (
              <div key={mood} className="flex items-center gap-3 text-xs">
                <span className="w-10 text-muted-foreground">{labels[mood]}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className={cn('h-full rounded-full', colors[mood])}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                  />
                </div>
                <span className="w-8 text-right text-muted-foreground">{pct}%</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Badges */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium">Badges</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {ALL_BADGES.map(b => {
            const earned = badges.some(ub => ub.id === b.id)
            return (
              <div
                key={b.id}
                className={cn(
                  'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-colors',
                  earned
                    ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30'
                    : 'border-border opacity-40'
                )}
              >
                <BadgeIcon name={b.icon} className={cn('w-5 h-5', earned ? 'text-amber-500' : 'text-muted-foreground')} />
                <span className="text-[10px] font-medium leading-tight">{b.name}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS PANEL
   ═══════════════════════════════════════════════════════════════ */

interface SettingsPanelProps {
  companion: CompanionConfig
  onChangePersona: (p: CompanionPersona) => void
  onChangeAura: (a: AuraMood) => void
  onClose: () => void
}

function SettingsPanel({ companion, onChangePersona, onChangeAura, onClose }: SettingsPanelProps) {
  const auraOptions: { id: AuraMood; label: string; gradient: string }[] = [
    { id: 'dawn-mist', label: 'Dawn Mist', gradient: 'from-purple-200 to-amber-100' },
    { id: 'sage-sanctuary', label: 'Sage Sanctuary', gradient: 'from-emerald-200 to-teal-100' },
    { id: 'twilight-solitude', label: 'Twilight Solitude', gradient: 'from-indigo-200 to-sky-100' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 32 }}
      className="fixed inset-y-0 right-0 w-full max-w-sm bg-background border-l border-border shadow-xl z-50 flex flex-col"
    >
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border shrink-0">
        <Settings className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium text-sm">Settings</span>
        <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {/* Companion style */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Companion style</h3>
          {(Object.entries(PERSONAS) as [CompanionPersona, typeof PERSONAS[CompanionPersona]][]).map(([id, p]) => (
            <button
              key={id}
              onClick={() => onChangePersona(id)}
              className={cn(
                'w-full text-left border rounded-xl px-3 py-2.5 transition-all',
                companion.persona === id
                  ? 'border-primary bg-primary/8 dark:bg-primary/15'
                  : 'border-border hover:border-primary/40 hover:bg-muted/40'
              )}
            >
              <div className="flex items-center gap-2.5">
                <span>{p.emoji}</span>
                <div>
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.desc}</div>
                </div>
                {companion.persona === id && <Check className="ml-auto w-3.5 h-3.5 text-primary" />}
              </div>
            </button>
          ))}
        </div>
        {/* Aura */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sanctuary aura</h3>
          <div className="grid grid-cols-3 gap-2">
            {auraOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => onChangeAura(opt.id)}
                className={cn(
                  'rounded-xl h-16 bg-gradient-to-br flex items-end p-1.5 text-[9px] font-medium transition-all',
                  opt.gradient,
                  companion.aura === opt.id ? 'ring-2 ring-primary ring-offset-1' : 'opacity-70 hover:opacity-100'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP  (client-only — reads localStorage, blink.auth)
   ═══════════════════════════════════════════════════════════════ */

function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [activeTab, setActiveTab] = useState<TabId>('companion')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [userId, setUserId] = useState<string>('guest')
  const xpToastRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Persist state whenever it changes
  useEffect(() => { saveState(state) }, [state])

  // Auth: use blink userId if signed in, otherwise stable guest id
  useEffect(() => {
    const unsub = blink.auth.onAuthStateChanged(authState => {
      setUserId(authState.user?.id ?? `guest-${getOrCreateGuestId()}`)
    })
    return unsub
  }, [])

  // Streak & word-of-day maintenance on mount
  useEffect(() => {
    setState(prev => {
      const today = todayStr()
      let { streak, lastActiveDate, wordOfDay } = prev
      if (lastActiveDate !== today) {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yStr = yesterday.toISOString().split('T')[0]
        streak = lastActiveDate === yStr ? streak + 1 : 1
        lastActiveDate = today
      }
      if (wordOfDay.date !== today) {
        wordOfDay = pickWordOfDay()
      }
      return { ...prev, streak, lastActiveDate, wordOfDay }
    })
  }, [])

  function update(partial: Partial<AppState>) {
    setState(prev => ({ ...prev, ...partial }))
  }

  /* ── XP & levelling ──────────────────────────────────────── */
  function grantXp(amount: number) {
    setState(prev => {
      const newXp = prev.xp + amount
      const newLevel = calcLevel(newXp)
      const nextBadges = [...prev.badges]
      // zen-master: level 5
      if (newLevel >= 5 && !nextBadges.some(b => b.id === 'zen-master')) {
        nextBadges.push({ ...ALL_BADGES.find(b => b.id === 'zen-master')!, unlockedAt: new Date().toISOString() })
      }
      return { ...prev, xp: newXp, level: newLevel, badges: nextBadges }
    })
  }

  function unlockBadge(id: string) {
    setState(prev => {
      if (prev.badges.some(b => b.id === id)) return prev
      const badge = ALL_BADGES.find(b => b.id === id)
      if (!badge) return prev
      return { ...prev, badges: [...prev.badges, { ...badge, unlockedAt: new Date().toISOString() }] }
    })
  }

  /* ── Onboarding complete ────────────────────────────────── */
  function handleOnboardingComplete(name: string, persona: CompanionPersona, aura: AuraMood) {
    update({ onboardingDone: true, companion: { name, persona, aura } })
  }

  /* ── Journal ────────────────────────────────────────────── */
  function handleAddJournalEntry(text: string, mood: JournalEntry['mood']) {
    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      text,
      mood,
      createdAt: new Date().toISOString(),
    }
    setState(prev => {
      const entries = [...prev.journalEntries, entry]
      const nextBadges = [...prev.badges]
      if (entries.length >= 1 && !nextBadges.some(b => b.id === 'first-reflection')) {
        nextBadges.push({ ...ALL_BADGES.find(b => b.id === 'first-reflection')!, unlockedAt: new Date().toISOString() })
      }
      return { ...prev, journalEntries: entries, badges: nextBadges }
    })
    grantXp(XP_PER_JOURNAL)
  }

  function handleDeleteJournalEntry(id: string) {
    setState(prev => ({ ...prev, journalEntries: prev.journalEntries.filter(e => e.id !== id) }))
  }

  /* ── Path markers ───────────────────────────────────────── */
  function handleAddMarker(text: string) {
    const marker: PathMarker = { id: crypto.randomUUID(), text, completed: false, createdAt: new Date().toISOString() }
    setState(prev => ({ ...prev, pathMarkers: [...prev.pathMarkers, marker] }))
  }

  function handleCompleteMarker(id: string) {
    setState(prev => {
      const updated = prev.pathMarkers.map(m => m.id === id ? { ...m, completed: true } : m)
      const completedCount = updated.filter(m => m.completed).length
      const nextBadges = [...prev.badges]
      if (completedCount >= 10 && !nextBadges.some(b => b.id === 'path-clearer')) {
        nextBadges.push({ ...ALL_BADGES.find(b => b.id === 'path-clearer')!, unlockedAt: new Date().toISOString() })
      }
      return { ...prev, pathMarkers: updated, badges: nextBadges }
    })
    grantXp(XP_PER_PATH_MARKER)
  }

  function handleDeleteMarker(id: string) {
    setState(prev => ({ ...prev, pathMarkers: prev.pathMarkers.filter(m => m.id !== id) }))
  }

  /* ── Intention ──────────────────────────────────────────── */
  function handleSetIntention(text: string) {
    if (text === state.intention) return
    update({ intention: text })
    grantXp(XP_PER_INTENTION)
  }

  /* ── RPG Context for companion ──────────────────────────── */
  const rpgContext: RpgContext = {
    level: state.level,
    xp: state.xp,
    streak: state.streak,
    activeQuestNames: state.activeQuests,
    recentBadgeNames: state.badges.slice(-3).map(b => b.name),
  }

  /* ── Companion XP grant callback ────────────────────────── */
  const handleCompanionXpGrant = useCallback((xp: number, _label: string) => {
    grantXp(xp)
  }, [])

  /* ── Companion quest callbacks ──────────────────────────── */
  const handleQuestAdd = useCallback((label: string) => {
    setState(prev => {
      if (prev.activeQuests.includes(label)) return prev
      return { ...prev, activeQuests: [...prev.activeQuests, label] }
    })
  }, [])

  const handleQuestComplete = useCallback((_questId: string | undefined, label: string) => {
    setState(prev => ({ ...prev, activeQuests: prev.activeQuests.filter(q => q !== label) }))
    grantXp(50)
  }, [])

  /* ── Tab nav config ─────────────────────────────────────── */
  type NavItem = { id: TabId; label: string; icon: LucideIcon }
  const NAV: NavItem[] = [
    { id: 'companion', label: 'Kora', icon: Sparkles },
    { id: 'journal', label: 'Journal', icon: PenLine },
    { id: 'rituals', label: 'Rituals', icon: Compass },
    { id: 'relax', label: 'Breathe', icon: Wind },
    { id: 'soundtrack', label: 'Sounds', icon: Music },
    { id: 'detox', label: 'Focus', icon: Brain },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
  ]

  const auraGradient = AURA_GRADIENTS[state.companion.aura]

  /* ── Personality display name (from localStorage) ────────── */
  const personality = loadPersonality(userId)

  /* ── Show onboarding if not done ─────────────────────────── */
  if (!state.onboardingDone) {
    return <Onboarding onComplete={handleOnboardingComplete} />
  }

  return (
    <div className={cn('min-h-dvh flex flex-col bg-gradient-to-br', auraGradient, 'bg-background')}>
      {/* ── Top bar ──────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-3 px-4 h-14 border-b border-border/60 bg-background/80 backdrop-blur-md sticky top-0 z-30">
        {/* Companion avatar + name */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/60 to-primary flex items-center justify-center text-primary-foreground text-sm">
            ✨
          </div>
          <div className="leading-none">
            <div className="text-sm font-semibold">{personality.displayName}</div>
            <div className="text-[10px] text-muted-foreground">Your companion</div>
          </div>
        </div>

        {/* XP / level pill */}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-xs">
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="font-medium">{state.xp.toLocaleString()} XP</span>
            <span className="text-muted-foreground">· Lvl {state.level}</span>
          </div>
          {state.streak > 0 && (
            <div className="flex items-center gap-1 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded-full px-2.5 py-1 text-xs text-orange-600 dark:text-orange-400">
              <Flame className="w-3 h-3" />
              <span className="font-medium">{state.streak}</span>
            </div>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Word of Day banner (companion tab only) ───────────── */}
      <AnimatePresence>
        {activeTab === 'companion' && (
          <motion.div
            key="wod"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 border-b border-border/40"
          >
            <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground bg-muted/30">
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium text-foreground">{state.wordOfDay.word}:</span>
              <span className="truncate">{state.wordOfDay.definition}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="h-full overflow-y-auto"
          >
            {activeTab === 'companion' && (
              <CompanionChat
                key={userId}
                userId={userId}
                rpgContext={rpgContext}
                onXpGrant={handleCompanionXpGrant}
                onQuestAdd={handleQuestAdd}
                onQuestComplete={handleQuestComplete}
                className="h-full"
              />
            )}
            {activeTab === 'journal' && (
              <JournalTab
                entries={state.journalEntries}
                onAddEntry={handleAddJournalEntry}
                onDeleteEntry={handleDeleteJournalEntry}
              />
            )}
            {activeTab === 'rituals' && (
              <RitualsTab
                pathMarkers={state.pathMarkers}
                intention={state.intention}
                onSetIntention={handleSetIntention}
                onAddMarker={handleAddMarker}
                onCompleteMarker={handleCompleteMarker}
                onDeleteMarker={handleDeleteMarker}
              />
            )}
            {activeTab === 'relax' && <RelaxTab />}
            {activeTab === 'soundtrack' && <SoundtrackTab />}
            {activeTab === 'detox' && <DetoxTab />}
            {activeTab === 'reports' && (
              <ReportsTab
                xp={state.xp}
                level={state.level}
                streak={state.streak}
                journalEntries={state.journalEntries}
                badges={state.badges}
                pathMarkers={state.pathMarkers}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Bottom nav ───────────────────────────────────────── */}
      <nav className="shrink-0 border-t border-border/60 bg-background/90 backdrop-blur-md z-20">
        <div className="flex items-stretch">
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors relative',
                activeTab === item.id
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label={item.label}
            >
              {activeTab === item.id && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute top-0 inset-x-2 h-0.5 bg-primary rounded-full"
                />
              )}
              <item.icon className="w-4.5 h-4.5" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ── Settings panel ───────────────────────────────────── */}
      <AnimatePresence>
        {settingsOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSettingsOpen(false)}
              className="fixed inset-0 bg-black/30 z-40"
            />
            <SettingsPanel
              companion={state.companion}
              onChangePersona={p => update({ companion: { ...state.companion, persona: p } })}
              onChangeAura={a => update({ companion: { ...state.companion, aura: a } })}
              onClose={() => setSettingsOpen(false)}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Guest ID helper ────────────────────────────────────────── */
function getOrCreateGuestId(): string {
  const key = 'thoughtica-guest-id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

/* ═══════════════════════════════════════════════════════════════
   ROUTE EXPORT
   ═══════════════════════════════════════════════════════════════ */

export const Route = createFileRoute('/')({
  ssr: false,
  component: () => (
    <BlinkClientBoundary>
      <App />
    </BlinkClientBoundary>
  ),
})
