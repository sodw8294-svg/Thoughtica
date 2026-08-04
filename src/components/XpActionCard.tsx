/**
 * XpActionCard — renders an XP action card embedded in a Kora reply.
 *
 * The LLM embeds cards in its text like:
 *   [⚡ Anchor Habit (+15 XP)]
 *   [🎯 Add Goal Quest (+25 XP)]
 *
 * This component displays them as tappable cards.  On click it fires
 * `onClaim(xp, label)` so the parent can award XP through the existing system.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface XpActionCardProps {
  label: string
  xp: number
  onClaim: (xp: number, label: string) => void
  className?: string
}

export function XpActionCard({ label, xp, onClaim, className }: XpActionCardProps) {
  const [claimed, setClaimed] = useState(false)

  function handleClick() {
    if (claimed) return
    setClaimed(true)
    onClaim(xp, label)
  }

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={claimed}
      whileHover={claimed ? {} : { scale: 1.02 }}
      whileTap={claimed ? {} : { scale: 0.97 }}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
        'border transition-all duration-200 select-none cursor-pointer',
        claimed
          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 cursor-default'
          : 'bg-primary/8 dark:bg-primary/15 border-primary/25 text-primary hover:bg-primary/15 dark:hover:bg-primary/25',
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {claimed ? (
          <motion.span
            key="check"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs">+{xp} XP claimed!</span>
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{label}</span>
            <span className="text-xs opacity-70">+{xp} XP</span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

/** ─────────────────────────────────────────────────────────────────
 *  parseXpCards — extract XP action cards from raw LLM text.
 *
 *  Matches patterns like:
 *    [⚡ Anchor Habit (+15 XP)]
 *    [🧘 3-Min Breathing Session (+20 XP)]
 *    [🎯 Add Goal Quest (+25 XP)]
 * ───────────────────────────────────────────────────────────────── */
export interface ParsedXpCard {
  raw: string        // original matched text
  label: string      // display label (without the XP part)
  xp: number
}

const XP_CARD_RE = /\[([^\]]+?)\s*\(\+(\d+)\s*XP\)\]/g

export function parseXpCards(text: string): ParsedXpCard[] {
  const cards: ParsedXpCard[] = []
  let match: RegExpExecArray | null
  XP_CARD_RE.lastIndex = 0
  while ((match = XP_CARD_RE.exec(text)) !== null) {
    cards.push({
      raw: match[0],
      label: match[1].trim(),
      xp: parseInt(match[2], 10),
    })
  }
  return cards
}

/** Strip XP card syntax from text so it doesn't render as raw brackets */
export function stripXpCards(text: string): string {
  return text.replace(XP_CARD_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}
