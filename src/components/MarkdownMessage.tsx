/**
 * MarkdownMessage — lightweight markdown renderer for Kora AI replies.
 *
 * Renders a safe subset of GitHub-flavoured Markdown without an external
 * parser dependency.  Handles: bold, italic, inline-code, code blocks,
 * headers (h1–h3), unordered/ordered lists, blockquotes, horizontal
 * rules, and line breaks.  All other HTML is escaped.
 */

interface MarkdownMessageProps {
  content: string
  className?: string
}

/** Escape HTML entities to prevent injection */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Apply inline markdown transforms to a single line of (already-escaped) text.
 * Order matters: code backticks first to avoid double-processing.
 */
function renderInline(escaped: string): string {
  // Inline code: `code`
  let out = escaped.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
  // Bold: **text** or __text__
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  // Italic: *text* or _text_
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>')
  // XP action card shorthand: [emoji Label (+N XP)] — already rendered by XpActionCard;
  // strip from inline text so it doesn't double-render as raw text.
  out = out.replace(/\[([^\]]+\(\+\d+\s*XP\))\]/g, '')
  return out
}

/** Convert raw markdown string → HTML string */
function markdownToHtml(raw: string): string {
  const lines = raw.split('\n')
  const parts: string[] = []
  let inCodeBlock = false
  let codeLang = ''
  let codeLines: string[] = []
  let inList: 'ul' | 'ol' | null = null
  let inBlockquote = false

  function flushList() {
    if (!inList) return
    const tag = inList === 'ul' ? 'ul' : 'ol'
    parts.push(`</${tag}>`)
    inList = null
  }

  function flushBlockquote() {
    if (!inBlockquote) return
    parts.push('</blockquote>')
    inBlockquote = false
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // ── Fenced code blocks ────────────────────────────────────────
    if (!inCodeBlock && /^```/.test(line)) {
      flushList()
      flushBlockquote()
      inCodeBlock = true
      codeLang = line.slice(3).trim()
      codeLines = []
      continue
    }
    if (inCodeBlock) {
      if (/^```/.test(line)) {
        inCodeBlock = false
        const langAttr = codeLang ? ` data-lang="${escapeHtml(codeLang)}"` : ''
        parts.push(
          `<pre class="md-code-block"${langAttr}><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`
        )
        codeLines = []
        codeLang = ''
      } else {
        codeLines.push(line)
      }
      continue
    }

    const escaped = escapeHtml(line)

    // ── Horizontal rule ───────────────────────────────────────────
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList()
      flushBlockquote()
      parts.push('<hr class="md-hr" />')
      continue
    }

    // ── Headers ───────────────────────────────────────────────────
    const headerMatch = /^(#{1,3})\s+(.+)$/.exec(line)
    if (headerMatch) {
      flushList()
      flushBlockquote()
      const level = headerMatch[1].length
      const text = renderInline(escapeHtml(headerMatch[2]))
      parts.push(`<h${level} class="md-h${level}">${text}</h${level}>`)
      continue
    }

    // ── Blockquote ────────────────────────────────────────────────
    if (/^>\s?/.test(line)) {
      flushList()
      const text = renderInline(escapeHtml(line.replace(/^>\s?/, '')))
      if (!inBlockquote) {
        parts.push('<blockquote class="md-blockquote">')
        inBlockquote = true
      }
      parts.push(`<p class="md-bq-p">${text}</p>`)
      continue
    }
    flushBlockquote()

    // ── Unordered list ────────────────────────────────────────────
    const ulMatch = /^(\s*)([-*+])\s+(.+)$/.exec(line)
    if (ulMatch) {
      if (inList !== 'ul') {
        flushList()
        parts.push('<ul class="md-ul">')
        inList = 'ul'
      }
      parts.push(`<li class="md-li">${renderInline(escapeHtml(ulMatch[3]))}</li>`)
      continue
    }

    // ── Ordered list ──────────────────────────────────────────────
    const olMatch = /^\d+\.\s+(.+)$/.exec(line)
    if (olMatch) {
      if (inList !== 'ol') {
        flushList()
        parts.push('<ol class="md-ol">')
        inList = 'ol'
      }
      parts.push(`<li class="md-li">${renderInline(escapeHtml(olMatch[1]))}</li>`)
      continue
    }

    flushList()

    // ── Empty line → paragraph break ──────────────────────────────
    if (line.trim() === '') {
      parts.push('<br />')
      continue
    }

    // ── Regular paragraph ─────────────────────────────────────────
    parts.push(`<p class="md-p">${renderInline(escaped)}</p>`)
  }

  // Flush any open structures
  flushList()
  flushBlockquote()
  if (inCodeBlock) {
    parts.push(`<pre class="md-code-block"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  }

  return parts.join('\n')
}

export function MarkdownMessage({ content, className = '' }: MarkdownMessageProps) {
  const html = markdownToHtml(content)
  return (
    <div
      className={`md-message ${className}`}
      // The HTML is generated by our own sanitising function — no user HTML
      // can survive as tags because we escape every raw string first.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised output
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
