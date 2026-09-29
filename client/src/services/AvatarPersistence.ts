import { AvatarChoice, AvatarPartId, DEFAULT_AVATAR_CHOICE, normalizeAvatarChoice } from '../avatarConfig'

const databaseUrl = (import.meta.env.VITE_RANKESTUDOS_DATABASE_URL || 'https://rankestudos2-default-rtdb.firebaseio.com').replace(/\/$/, '')
const allowedParts: AvatarPartId[] = ['skin', 'hair', 'top', 'jacket', 'bottom', 'shoes', 'hat', 'glasses']

function profileKey(name: string) {
  return name.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR').replace(/[.#$\[\]\/]/g, '_').slice(0, 80)
}

export async function loadAvatarByName(name: string): Promise<AvatarChoice | null> {
  const key = profileKey(name)
  if (!key) return null
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 7000)
  try {
    const response = await fetch(databaseUrl + '/skyofficeAvatars/' + encodeURIComponent(key) + '.json', { cache: 'no-store', signal: controller.signal })
    let saved = response.ok ? await response.json() : null
    // Older profiles may have been saved under a key with a different accent,
    // spacing, or capitalization. Fall back to the stored display name so a
    // returning player is recognized instead of seeing the creator again.
    if (!saved || typeof saved !== 'object') {
      const allResponse = await fetch(databaseUrl + '/skyofficeAvatars.json', { cache: 'no-store', signal: controller.signal })
      if (allResponse.ok) {
        const all = await allResponse.json() as Record<string, { name?: string; choice?: unknown; appearance?: string }> | null
        const normalized = name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
        const match = Object.values(all || {}).find(item => String(item?.name || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase() === normalized)
        saved = match || null
      }
    }
    if (!saved || typeof saved !== 'object') return null
    let source = saved.choice && typeof saved.choice === 'object' ? saved.choice : saved
    if (typeof saved.appearance === 'string') {
      try { source = { ...source, parts: JSON.parse(saved.appearance) } } catch { /* use saved choice */ }
    }
    const rawParts = source.parts && typeof source.parts === 'object' ? source.parts : {}
    const parts: Partial<Record<AvatarPartId, string>> = { ...(DEFAULT_AVATAR_CHOICE.parts || {}) }
    allowedParts.forEach((part) => {
      const value = rawParts[part]
      if (typeof value === 'string' && (value === '' || /^[a-z0-9_-]{1,80}$/i.test(value))) parts[part] = value
    })
    return normalizeAvatarChoice({ ...DEFAULT_AVATAR_CHOICE, parts })
  } catch {
    return null
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function saveAvatarByName(name: string, choice: AvatarChoice): Promise<void> {
  const key = profileKey(name)
  if (!key) return
  choice = normalizeAvatarChoice(choice)
  const safeParts: Partial<Record<AvatarPartId, string>> = {}
  allowedParts.forEach((part) => {
    const value = choice.parts?.[part]
    if (typeof value === 'string' && (value === '' || /^[a-z0-9_-]{1,80}$/i.test(value))) safeParts[part] = value
  })
  const response = await fetch(databaseUrl + '/skyofficeAvatars/' + encodeURIComponent(key) + '.json', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim().slice(0, 24), choice: { parts: safeParts }, appearance: JSON.stringify(safeParts), updatedAt: Date.now() }),
  })
  if (!response.ok) throw new Error('Não foi possível salvar o avatar na nuvem.')
}
