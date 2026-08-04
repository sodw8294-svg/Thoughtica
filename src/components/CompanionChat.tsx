/**
 * CompanionChat — the primary conversation UI for Kora.
 *
 * Features:
 * - Renders conversation history with message grouping
 * - Typing indicator (3 bouncing dots) while awaiting AI
 * - Auto-scroll to latest message
 * - Markdown rendering in AI replies via MarkdownMessage
 * - XP action cards parsed from replies via XpActionCard
 * - Coaching suggestion banner (non-intrusive, dismissable)
 * - Disabled input during AI response (debounce protection)
 * - Error handling with friendly messages
 * - Animated message entrance via framer-motion
 * - Responsive layout
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Trash2, X, Sparkles } from 'lucide-react'
import { processCompanionTurn, clearConversation } from '@/lib/companion'
import type { RpgContext, CompanionSidecar } from '@/lib/companion'
import { MarkdownMessage } from './MarkdownMessage'
import { XpActionCard, parseXpCards, stripXpCards } from './XpActionCard'
import { cn } from '@/lib/utils'

/* ─── Types ─────────────────────────────────────────────────── */

export interface ChatDisplayMessage {
  id: string
  role: 'user' | 'companion'
  text: string
  timestamp: string
  sidecar?: CompanionSidecar | null
}

interface CompanionChatProps {
  userId: string
  rpgContext: RpgContext
  /** Initial welcome message shown before the user sends anything */
  welcomeMessage?: string
  /** Called when an XP grant happens (from XP card or sidecar) */
  onXpGrant?: (xp: number, label: string) => void
  /** Called when a quest should be added */
  onQuestAdd?: (label: string) => void
  /** Called when a quest should be marked complete */
  onQuestComplete?: (questId: string | undefined, label: string) => void
  className?: string
}

/* ─── Typing indicator ───────────────────────────────────────── */

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 px-1">
      <div className="flex items-center gap-1.5 bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
        {[0, 1, 2].map(i => (
          <motion.span
            key={i}
            className="block w-1.5 h-1.5 rounded-full bg-muted-foreground/60"
            animate={{ y: [0, -4, 0] }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.15,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </div>
  )
}

/* ─── Single message bubble ──────────────────────────────────── */

interface MessageBubbleProps {
  message: ChatDisplayMessage
  isGrouped: boolean   // true when immediately following a message from same role
  onXpClaim: (xp: number, label: string) => void
}

function MessageBubble({ message, isGrouped, onXpClaim }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const cards = isUser ? [] : parseXpCards(message.text)
  const displayText = isUser ? message.text : stripXpCards(message.text)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={cn(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start',
        isGrouped ? 'mt-1' : 'mt-4'
      )}
    >
      <div
        className={cn(
          'max-w-[82%] md:max-w-[70%]',
          isUser ? 'items-end' : 'items-start',
          'flex flex-col gap-1.5'
        )}
      >
        {/* Bubble */}
        <div
          className={cn(
            'px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm'
              : 'bg-muted text-foreground rounded-2xl rounded-bl-sm',
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{displayText}</p>
          ) : (
            <MarkdownMessage content={displayText} className="prose-companion" />
          )}
        </div>

        {/* XP action cards below the bubble */}
        {cards.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-1">
            {cards.map((card, idx) => (
              <XpActionCard
                key={`${message.id}-card-${idx}`}
                label={card.label}
                xp={card.xp}
                onClaim={onXpClaim}
              />
            ))}
          </div>
        )}

        {/* Timestamp on hover */}
        <span
          className={cn(
            'text-[10px] text-muted-foreground/50 px-1 opacity-0 group-hover:opacity-100 transition-opacity',
            isUser ? 'self-end' : 'self-start'
          )}
        >
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  )
}

/* ─── Coaching suggestion banner ─────────────────────────────── */

function CoachingBanner({ suggestion, onDismiss }: { suggestion: string; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-4 mb-3"
    >
      <div className="flex items-start gap-2 bg-primary/8 dark:bg-primary/15 border border-primary/20 rounded-xl px-3 py-2.5 text-sm text-primary">
        <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span className="flex-1 leading-snug">{suggestion}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-primary/50 hover:text-primary transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  )
}

/* ─── XP gain notification ───────────────────────────────────── */

function XpToast({ xp, label }: { xp: number; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ duration: 0.25 }}
      className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
    >
      <div className="flex items-center gap-2 bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg">
        <span>⚡</span>
        <span>+{xp} XP — {label}</span>
      </div>
    </motion.div>
  )
}

/* ─── Main component ─────────────────────────────────────────── */

export function CompanionChat({
  userId,
  rpgContext,
  welcomeMessage = "Welcome to your sanctuary. I'm here with you. How are you feeling today?",
  onXpGrant,
  onQuestAdd,
  onQuestComplete,
  className,
}: CompanionChatProps) {
  const [messages, setMessages] = useState<ChatDisplayMessage[]>([
    {
      id: 'welcome',
      role: 'companion',
      text: welcomeMessage,
      timestamp: new Date().toISOString(),
    },
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [coachingBanner, setCoachingBanner] = useState<string | null>(null)
  const [xpToast, setXpToast] = useState<{ xp: number; label: string } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sendingRef = useRef(false)  // debounce guard

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isTyping])

  // Show XP toast for 2.5 s
  function showXpToast(xp: number, label: string) {
    setXpToast({ xp, label })
    setTimeout(() => setXpToast(null), 2500)
  }

  const handleXpClaim = useCallback(
    (xp: number, label: string) => {
      onXpGrant?.(xp, label)
      showXpToast(xp, label)
    },
    [onXpGrant]
  )

  // Process sidecar side-effects
  function applySidecar(sidecar: CompanionSidecar) {
    if (sidecar.coaching_suggestion) {
      setCoachingBanner(sidecar.coaching_suggestion)
    }
    if (sidecar.rpg_action) {
      const act = sidecar.rpg_action
      if (act.type === 'xp_grant' && act.xp) {
        onXpGrant?.(act.xp, act.label)
        showXpToast(act.xp, act.label)
      } else if (act.type === 'quest_add') {
        onQuestAdd?.(act.label)
      } else if (act.type === 'quest_complete') {
        onQuestComplete?.(act.questId, act.label)
      }
    }
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isTyping || sendingRef.current) return
    sendingRef.current = true

    const userMsg: ChatDisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)
    setErrorMsg(null)
    setCoachingBanner(null)

    try {
      const result = await processCompanionTurn({
        userId,
        userMessage: text,
        rpgContext,
      })

      const companionMsg: ChatDisplayMessage = {
        id: crypto.randomUUID(),
        role: 'companion',
        text: result.reply,
        timestamp: new Date().toISOString(),
        sidecar: result.sidecar,
      }
      setMessages(prev => [...prev, companionMsg])
      applySidecar(result.sidecar)
    } catch (err) {
      const friendly = "I'm having a quiet moment — please try again in a second. 🌿"
      setErrorMsg(friendly)
      const errMsg: ChatDisplayMessage = {
        id: crypto.randomUUID(),
        role: 'companion',
        text: friendly,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsTyping(false)
      sendingRef.current = false
      // Re-focus input after response
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, isTyping, userId, rpgContext, onXpGrant, onQuestAdd, onQuestComplete])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    sendMessage()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleClearConversation() {
    clearConversation(userId)
    setMessages([
      {
        id: 'welcome',
        role: 'companion',
        text: welcomeMessage,
        timestamp: new Date().toISOString(),
      },
    ])
    setErrorMsg(null)
    setCoachingBanner(null)
  }

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }

  return (
    <div className={cn('flex flex-col h-full min-h-0 relative', className)}>
      {/* ── Message list ──────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 scroll-smooth"
      >
        <div className="max-w-2xl mx-auto">
          {messages.map((msg, idx) => {
            const prev = messages[idx - 1]
            const isGrouped = !!prev && prev.role === msg.role && idx > 0
            return (
              <div key={msg.id} className="group">
                <MessageBubble
                  message={msg}
                  isGrouped={isGrouped}
                  onXpClaim={handleXpClaim}
                />
              </div>
            )
          })}

          {/* Typing indicator */}
          <AnimatePresence>
            {isTyping && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4"
              >
                <TypingIndicator />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Coaching banner (above input) ─────────────────────── */}
      <AnimatePresence>
        {coachingBanner && (
          <CoachingBanner
            key="coaching"
            suggestion={coachingBanner}
            onDismiss={() => setCoachingBanner(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Input bar ────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-3">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2">
            {/* Clear button */}
            <button
              type="button"
              onClick={handleClearConversation}
              className="shrink-0 mb-0.5 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Clear conversation"
              title="Clear conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Text input */}
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isTyping}
                placeholder="Message Kora…"
                rows={1}
                className={cn(
                  'w-full resize-none rounded-2xl border border-input bg-background',
                  'px-4 py-2.5 pr-12 text-sm leading-relaxed',
                  'focus:outline-none focus:ring-2 focus:ring-ring/40',
                  'placeholder:text-muted-foreground/50',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-all duration-150 max-h-[140px]'
                )}
                style={{ height: 'auto', minHeight: '44px' }}
              />
            </div>

            {/* Send button */}
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className={cn(
                'shrink-0 mb-0.5 p-2.5 rounded-xl transition-all duration-150',
                input.trim() && !isTyping
                  ? 'bg-primary text-primary-foreground hover:opacity-90 active:scale-95'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Error notice (inline, not blocking) */}
          <AnimatePresence>
            {errorMsg && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-xs text-muted-foreground mt-1 px-1"
              >
                {errorMsg}
              </motion.p>
            )}
          </AnimatePresence>
        </form>
      </div>

      {/* ── XP Toast overlay ─────────────────────────────────── */}
      <AnimatePresence>
        {xpToast && (
          <XpToast key="xp-toast" xp={xpToast.xp} label={xpToast.label} />
        )}
      </AnimatePresence>
    </div>
  )
}
