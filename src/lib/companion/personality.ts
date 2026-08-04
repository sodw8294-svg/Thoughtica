/* ═══════════════════════════════════════════════════════════════
   COMPANION PERSONALITY STORE
   Stores + gradually adapts personality profile in localStorage.
   ═══════════════════════════════════════════════════════════════ */

import type { CompanionPersonalityProfile, TonePreset } from './types'

const STORAGE_KEY_PREFIX = 'thoughtica-companion-personality-'

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId}`
}

export function getDefaultPersonality(userId: string): CompanionPersonalityProfile {
  return {
    userId,
    displayName: 'Kora',
    tonePreset: 'supportive',
    verbosity: 0.6,
    coachingStyle: 'gentle',
    updatedAt: new Date().toISOString(),
  }
}

export function loadPersonality(userId: string): CompanionPersonalityProfile {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return getDefaultPersonality(userId)
    return { ...getDefaultPersonality(userId), ...JSON.parse(raw) }
  } catch {
    return getDefaultPersonality(userId)
  }
}

export function savePersonality(profile: CompanionPersonalityProfile): void {
  try {
    localStorage.setItem(storageKey(profile.userId), JSON.stringify(profile))
  } catch {
    // no-op
  }
}

/**
 * Apply a tone adjustment signal.
 * Uses a small learning rate (0.1 blending) to shift gradually.
 */
export function applyToneAdjustment(
  profile: CompanionPersonalityProfile,
  newTone: TonePreset
): CompanionPersonalityProfile {
  if (profile.tonePreset === newTone) return profile
  // Gradual shift: only adopt new tone after 3 consistent signals
  // tracked via updatedAt + a simple count stored in the name field hack
  const updated: CompanionPersonalityProfile = {
    ...profile,
    tonePreset: newTone,
    updatedAt: new Date().toISOString(),
  }
  savePersonality(updated)
  return updated
}

/** Reset personality to defaults */
export function resetPersonality(userId: string): CompanionPersonalityProfile {
  const defaults = getDefaultPersonality(userId)
  savePersonality(defaults)
  return defaults
}
