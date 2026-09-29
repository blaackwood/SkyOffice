import manifestData from './data/atelier-avatar.json'
export type AvatarPartId = 'skin' | 'hair' | 'top' | 'jacket' | 'bottom' | 'shoes' | 'hat' | 'glasses'
export type AvatarChoice = { avatar: string; tint: number; parts?: Partial<Record<AvatarPartId, string>> }
export const DEFAULT_AVATAR_CHOICE: AvatarChoice = {
  avatar: 'atelier', tint: 0xffffff,
  parts: { skin: 'skin_02', hair: 'hair_01', top: 'top_01', jacket: 'jacket_01', bottom: 'pants_01', shoes: 'shoes_01', hat: '', glasses: '' },
}
export const AVATAR_TINTS = [{ name: 'Original', value: 0xffffff }]
export function normalizeAvatarParts(input: AvatarChoice['parts']): NonNullable<AvatarChoice['parts']> {
  const result: NonNullable<AvatarChoice['parts']> = {}
  for (const part of Object.keys(DEFAULT_AVATAR_CHOICE.parts!) as AvatarPartId[]) {
    const slot = part === 'bottom' ? 'pants' : part
    const value = input?.[part]
    const required = ['skin', 'bottom', 'shoes', 'top'].includes(part)
    const valid = manifestData.items.some(item => item.slot === slot && item.id === value)
    // Existing names retain a usable avatar even if their old item IDs no longer exist.
    result[part] = valid ? value! : value === '' && !required ? '' : DEFAULT_AVATAR_CHOICE.parts![part]!
  }
  return result
}
export function normalizeAvatarChoice(choice: AvatarChoice): AvatarChoice {
  return { avatar: 'atelier', tint: 0xffffff, parts: normalizeAvatarParts(choice.parts) }
}
const storageKey = (name: string) => `skyoffice_avatar_${name.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase()}`
export function loadSavedAvatar(name: string): AvatarChoice | null {
  if (!name.trim()) return null
  try {
    const raw = localStorage.getItem(storageKey(name)) || localStorage.getItem(`skyoffice_avatar_${name.trim().toLowerCase()}`)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!saved || typeof saved !== 'object' || (!saved.parts && typeof saved.avatar !== 'string')) return null
    const choice = normalizeAvatarChoice(saved)
    saveAvatar(name, choice)
    return choice
  } catch { return null }
}
export function saveAvatar(name: string, choice: AvatarChoice) {
  if (!name.trim()) return
  try { localStorage.setItem(storageKey(name), JSON.stringify(normalizeAvatarChoice(choice))) } catch { /* Storage may be unavailable. */ }
}
