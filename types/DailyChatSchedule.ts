const brasiliaFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function brasiliaParts(timestamp: number) {
  const parts = brasiliaFormatter.formatToParts(new Date(timestamp))
  const value = (name: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === name)?.value || 0)
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') }
}

export function brasiliaDayKey(timestamp: number) {
  const { year, month, day } = brasiliaParts(timestamp)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function brasiliaChatClearCycleKey(timestamp: number) {
  const now = brasiliaParts(timestamp)
  const hasReachedClearTime = now.hour === 23 && now.minute >= 55
  const cycleDate = new Date(Date.UTC(now.year, now.month - 1, now.day - (hasReachedClearTime ? 0 : 1)))
  return `${cycleDate.getUTCFullYear()}-${String(cycleDate.getUTCMonth() + 1).padStart(2, '0')}-${String(cycleDate.getUTCDate()).padStart(2, '0')}`
}

export function millisecondsUntilBrasiliaChatClear(timestamp: number) {
  const now = brasiliaParts(timestamp)
  const nowAsUtc = Date.UTC(now.year, now.month - 1, now.day, now.hour, now.minute, now.second)
  const offset = nowAsUtc - Math.floor(timestamp / 1000) * 1000
  const clearToday = now.hour < 23 || (now.hour === 23 && now.minute < 55)
  const targetLocalAsUtc = Date.UTC(now.year, now.month - 1, now.day + (clearToday ? 0 : 1), 23, 55, 0)
  let target = targetLocalAsUtc - offset
  const targetParts = brasiliaParts(target)
  const targetAsUtc = Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day, targetParts.hour, targetParts.minute, targetParts.second)
  const targetOffset = targetAsUtc - Math.floor(target / 1000) * 1000
  target = targetLocalAsUtc - targetOffset
  return Math.max(1, target - timestamp)
}

export function shouldClearDailyChat(timestamp: number, lastClearedCycleKey: string) {
  return brasiliaChatClearCycleKey(timestamp) !== lastClearedCycleKey
}
