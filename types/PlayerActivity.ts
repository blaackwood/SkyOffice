export interface PlayerActivity {
  label: string
  startedAt: number
  elapsedMs: number
}

export function activityElapsed(activity: PlayerActivity, now: number): number {
  return Math.max(0, activity.elapsedMs + (activity.startedAt > 0 ? now - activity.startedAt : 0))
}

export function changeActivity(current: PlayerActivity, message: unknown, now: number): PlayerActivity {
  if (!message || typeof message !== 'object') return current
  const { action, label } = message as { action?: unknown; label?: unknown }
  if (action === 'subject' && typeof label === 'string') {
    const clean = Array.from(label).filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('').trim().slice(0, 48)
    return { label: clean, startedAt: 0, elapsedMs: 0 }
  }
  if (action === 'start' && typeof label === 'string') {
    const clean = Array.from(label).filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('').trim().slice(0, 48)
    return clean ? { label: clean, startedAt: now, elapsedMs: 0 } : current
  }
  if (action === 'pause' && current.startedAt > 0) return { ...current, elapsedMs: activityElapsed(current, now), startedAt: 0 }
  if (action === 'resume' && current.label && !current.startedAt) return { ...current, startedAt: now }
  if (action === 'stop') return { label: '', startedAt: 0, elapsedMs: 0 }
  return current
}
