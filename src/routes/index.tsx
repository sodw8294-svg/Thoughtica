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

/* ... file unchanged for brevity in this tool payload ... */
