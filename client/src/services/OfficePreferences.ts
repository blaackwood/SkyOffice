export type OfficeStatus = 'active' | 'busy' | 'away'

export interface OfficePreferences {
  status: OfficeStatus
  microphoneId: string
  cameraId: string
  selfViewHidden: boolean
  cameraMirrored: boolean
  nearbyVolume: number
}

const STORAGE_KEY = 'skyoffice.preferences.v1'
const defaults: OfficePreferences = {
  status: 'active',
  microphoneId: '',
  cameraId: '',
  selfViewHidden: false,
  cameraMirrored: false,
  nearbyVolume: 80,
}

export function loadOfficePreferences(): OfficePreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<OfficePreferences>
    return {
      ...defaults,
      ...saved,
      status: saved.status && ['active', 'busy', 'away'].includes(saved.status)
        ? saved.status
        : defaults.status,
      nearbyVolume: Math.max(0, Math.min(100, Number(saved.nearbyVolume ?? defaults.nearbyVolume))),
    }
  } catch {
    return { ...defaults }
  }
}

export function saveOfficePreferences(update: Partial<OfficePreferences>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadOfficePreferences(), ...update }))
  } catch {
    // Preferences are optional when browser storage is unavailable.
  }
}
