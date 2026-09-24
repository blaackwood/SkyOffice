export interface LiveStudyRecord {
  name?: string
  accumulated?: number
  runningSince?: number
  pausedAt?: number
}

export interface LiveStudyTimer {
  accumulated: number
  runningSince: number
  paused: boolean
}

export const databaseUrl = (
  import.meta.env.VITE_RANKESTUDOS_DATABASE_URL ||
  'https://rankestudos2-default-rtdb.firebaseio.com'
).replace(/\/$/, '')

function normalizeName(name: string) {
  return name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

export function formatStudyName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s'-])([a-zà-öø-ÿ])/g, (_match, separator: string, letter: string) =>
      separator + letter.toLocaleUpperCase('pt-BR')
    )
}

export async function fetchOwnLiveStudy(name: string): Promise<LiveStudyTimer | null> {
  const cleanName = formatStudyName(name)
  if (!cleanName) return null

  // Query Firebase by name so the office fetches only this user's live timer.
  // The /live node needs an .indexOn entry for `name` in its RTDB rules.
  const nameVariants = [...new Set([
    cleanName,
    cleanName.toLocaleLowerCase('pt-BR'),
    cleanName.toLocaleUpperCase('pt-BR'),
    normalizeName(cleanName),
  ])]
  const matchingRecords: LiveStudyRecord[] = []
  for (const candidate of nameVariants) {
    const query = new URLSearchParams({ orderBy: '"name"', equalTo: `"${candidate}"` })
    const response = await fetch(`${databaseUrl}/live.json?${query.toString()}`, { cache: 'no-store' })
    if (!response.ok) {
      const details = await response.text()
      if (details.includes('Index not defined')) {
        throw new Error('O Firebase precisa do índice .indexOn ["name"] em live nas regras do banco.')
      }
      throw new Error(`Realtime Database respondeu ${response.status}`)
    }
    const records = (await response.json()) as Record<string, LiveStudyRecord> | null
    if (records && typeof records === 'object') matchingRecords.push(...Object.values(records))
    if (matchingRecords.length) break
  }

  const matching = matchingRecords
    .filter((record) => record && normalizeName(String(record.name || '')) === normalizeName(name))
    .sort((a, b) => Number(b.runningSince || 0) - Number(a.runningSince || 0))[0]

  if (!matching) return null
  return {
    accumulated: Math.max(0, Number(matching.accumulated) || 0),
    runningSince: Math.max(0, Number(matching.runningSince) || 0),
    paused: Number(matching.pausedAt) > 0,
  }
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function pinHashInput(name: string, pin: string) {
  return `${name.toLowerCase().trim()}:${pin}`
}

async function readPinHash(name: string): Promise<string | null> {
  const cleanName = formatStudyName(name)
  const response = await fetch(`${databaseUrl}/pins/${encodeURIComponent(cleanName)}.json`, {
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Não foi possível consultar o PIN no RankEstudos.')
  const record = await response.json()
  if (record?.hash) return String(record.hash)

  // Compatibilidade com nomes cadastrados com grafia diferente (maiúsculas/minúsculas).
  const allResponse = await fetch(`${databaseUrl}/pins.json`, { cache: 'no-store' })
  if (!allResponse.ok) throw new Error('Não foi possível consultar o PIN no RankEstudos.')
  const allPins = (await allResponse.json()) as Record<string, { hash?: string }> | null
  const matchingName = Object.keys(allPins || {}).find(
    (key) => key.toLowerCase().trim() === name.toLowerCase().trim()
  )
  return matchingName && allPins?.[matchingName]?.hash ? String(allPins[matchingName].hash) : null
}

export async function hasStudyPin(name: string): Promise<boolean> {
  return (await readPinHash(name)) !== null
}

export interface StudyEntryValues {
  hours: number
  questions: number
  flashcards: number
  corrections: number
  classHours: number
}

export async function submitStudyHours(
  name: string,
  values: StudyEntryValues,
  pin: string,
  confirmation: string
) {
  const cleanName = formatStudyName(name)
  const cleanPin = pin.trim()
  if (!cleanName) throw new Error('Entre na sala com seu nome antes de lançar horas.')
  const limits: Array<[keyof StudyEntryValues, number, string]> = [
    ['hours', 24, 'Horas'],
    ['questions', 3000, 'Questões'],
    ['flashcards', 5000, 'Flashcards'],
    ['corrections', 3000, 'Correções'],
    ['classHours', 24, 'Horas de aula'],
  ]
  if (!limits.some(([field]) => values[field] > 0)) {
    throw new Error('Preencha pelo menos uma atividade para lançar.')
  }
  for (const [field, max, label] of limits) {
    if (!Number.isFinite(values[field]) || values[field] < 0 || values[field] > max) {
      throw new Error(`${label}: informe um valor entre 0 e ${max}.`)
    }
  }
  if (!/^\d{4,6}$/.test(cleanPin)) throw new Error('O PIN precisa ter de 4 a 6 números.')

  const existingHash = await readPinHash(cleanName)
  const enteredHash = await sha256Hex(pinHashInput(cleanName, cleanPin))
  if (existingHash) {
    if (enteredHash !== existingHash) throw new Error('PIN incorreto.')
  } else {
    if (confirmation.trim() !== cleanPin) throw new Error('Os PINs digitados não correspondem.')
    const pinResponse = await fetch(`${databaseUrl}/pins/${encodeURIComponent(cleanName)}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash: enteredHash, createdAt: Date.now() }),
    })
    if (!pinResponse.ok) throw new Error('Não foi possível cadastrar o PIN no RankEstudos.')
  }

  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const entryResponse = await fetch(`${databaseUrl}/entries.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: cleanName,
      date,
      hours: Math.round(values.hours * 100) / 100,
      questions: Math.floor(values.questions),
      flashcards: Math.floor(values.flashcards),
      corrections: Math.floor(values.corrections),
      aula: Math.round(values.classHours * 100) / 100,
      ts: { '.sv': 'timestamp' },
    }),
  })
  if (!entryResponse.ok) throw new Error('O RankEstudos não aceitou o lançamento de horas.')
}
