export interface LiveStudyRecord {
  name?: string
  accumulated?: number
  runningSince?: number
  pausedAt?: number
  startedAt?: number
}

export interface LiveStudyTimer {
  accumulated: number
  runningSince: number
  paused: boolean
}

export interface LiveStudySession {
  id: string
  name: string
  accumulated: number
  runningSince: number
  pausedAt: number
  startedAt: number
}

export interface StudyLeaderboardEntry {
  name: string
  hours: number
  questions: number
  flashcards: number
  corrections: number
}

export const databaseUrl = (
  import.meta.env.VITE_RANKESTUDOS_DATABASE_URL ||
  'https://rankestudos2-default-rtdb.firebaseio.com'
).replace(/\/$/, '')

async function rankFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 10_000)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('O RankEstudos demorou mais de 10 segundos para responder. Confira sua conexão e tente novamente.')
    }
    throw new Error('Não consegui conectar ao RankEstudos. Confira sua conexão e tente novamente.')
  } finally {
    window.clearTimeout(timeout)
  }
}

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
    const response = await rankFetch(`${databaseUrl}/live.json?${query.toString()}`, { cache: 'no-store' })
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

export async function fetchTodayGroupStudyHours(): Promise<number> {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const response = await rankFetch(databaseUrl + '/entries.json', { cache: 'no-store' })
  if (!response.ok) throw new Error('Não consegui atualizar as horas do grupo.')
  const entries = (await response.json()) as Record<string, { date?: string; hours?: number; aula?: number }> | null
  return Object.values(entries || {}).reduce((total, entry) => {
    if (entry?.date !== date) return total
    return total + Math.max(0, Number(entry.hours) || 0) + Math.max(0, Number(entry.aula) || 0)
  }, 0)
}

/** Returns the current day's RankEstudos leaderboard used by the office banner. */
export async function fetchTodayStudyLeaderboard(): Promise<StudyLeaderboardEntry[]> {
  const date = studyDate(Date.now())
  const totals = new Map<string, StudyLeaderboardEntry>()
  const addToTotal = (name: string, hours: number, questions = 0, flashcards = 0, corrections = 0) => {
    if (!name.trim()) return
    const cleanName = formatStudyName(name)
    const key = normalizeName(cleanName)
    const current = totals.get(key) || { name: cleanName, hours: 0, questions: 0, flashcards: 0, corrections: 0 }
    current.hours += Math.max(0, hours)
    current.questions += Math.max(0, questions)
    current.flashcards += Math.max(0, flashcards)
    current.corrections += Math.max(0, corrections)
    totals.set(key, current)
  }

  // Load saved launches and active timers together. An active timer is included
  // immediately, so the banner works even before someone stops today's timer.
  const [entriesResult, liveResult] = await Promise.allSettled([
    rankFetch(databaseUrl + '/entries.json', { cache: 'no-store' }),
    fetchLiveStudySessions(),
  ])

  if (entriesResult.status === 'fulfilled' && entriesResult.value.ok) {
    const entries = (await entriesResult.value.json()) as Record<string, {
      name?: string
      date?: string
      hours?: number
      aula?: number
      questions?: number
      flashcards?: number
      corrections?: number
    }> | null
    Object.values(entries || {}).forEach((entry) => {
      if (!entry || entry.date !== date) return
      addToTotal(
        String(entry.name || ''),
        (Number(entry.hours) || 0) + (Number(entry.aula) || 0),
        Number(entry.questions) || 0,
        Number(entry.flashcards) || 0,
        Number(entry.corrections) || 0,
      )
    })
  }

  if (liveResult.status === 'fulfilled') {
    const now = Date.now()
    liveResult.value.forEach((session) => {
      const elapsedMs = session.accumulated + (session.runningSince > 0 ? Math.max(0, now - session.runningSince) : 0)
      addToTotal(session.name, elapsedMs / 3_600_000)
    })
  }

  if (entriesResult.status === 'rejected' && liveResult.status === 'rejected') {
    throw new Error('Não consegui atualizar o ranking do dia.')
  }

  return [...totals.values()]
    .sort((a, b) => b.hours - a.hours || b.questions - a.questions || b.flashcards - a.flashcards || a.name.localeCompare(b.name, 'pt-BR'))
    .map((entry) => ({ ...entry, hours: Math.round(entry.hours * 100) / 100 }))
}

export async function fetchLiveStudySessions(): Promise<LiveStudySession[]> {
  const response = await rankFetch(databaseUrl + '/live.json', { cache: 'no-store' })
  if (!response.ok) throw new Error('Não consegui consultar os cronômetros do RankEstudos.')
  const records = (await response.json()) as Record<string, LiveStudyRecord> | null
  return Object.entries(records || {}).map(([id, record]) => ({
    id,
    name: String(record?.name || ''),
    accumulated: Math.max(0, Number(record?.accumulated) || 0),
    runningSince: Math.max(0, Number(record?.runningSince) || 0),
    pausedAt: Math.max(0, Number(record?.pausedAt) || 0),
    startedAt: Math.max(0, Number(record?.startedAt) || 0),
  })).filter((record) => record.name)
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
  const response = await rankFetch(`${databaseUrl}/pins/${encodeURIComponent(cleanName)}.json`, {
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Não foi possível consultar o PIN no RankEstudos.')
  const record = await response.json()
  if (record?.hash) return String(record.hash)

  // Compatibilidade com nomes cadastrados com grafia diferente (maiúsculas/minúsculas).
  const allResponse = await rankFetch(`${databaseUrl}/pins.json`, { cache: 'no-store' })
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

async function verifyOrCreateStudyPin(name: string, pin: string, confirmation: string, createIfMissing: boolean) {
  const cleanName = formatStudyName(name)
  const cleanPin = pin.trim()
  if (!/^\d{4,6}$/.test(cleanPin)) throw new Error('O PIN precisa ter de 4 a 6 números.')
  const existingHash = await readPinHash(cleanName)
  const enteredHash = await sha256Hex(pinHashInput(cleanName, cleanPin))
  if (existingHash) {
    if (enteredHash !== existingHash) throw new Error('PIN incorreto.')
    return
  }
  if (!createIfMissing) throw new Error('Esse nome ainda não tem PIN no RankEstudos.')
  if (confirmation.trim() !== cleanPin) throw new Error('Os PINs digitados não correspondem.')
  const pinResponse = await rankFetch(databaseUrl + '/pins/' + encodeURIComponent(cleanName) + '.json', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash: enteredHash, createdAt: Date.now() }),
  })
  if (!pinResponse.ok) throw new Error('Não foi possível cadastrar o PIN no RankEstudos.')
}

async function verifyExistingStudyPin(name: string, pin: string) {
  const existingHash = await readPinHash(name)
  if (!existingHash) return
  const cleanPin = pin.trim()
  if (!/^\d{4,6}$/.test(cleanPin)) throw new Error('Digite o PIN do RankEstudos para controlar esse cronômetro.')
  const enteredHash = await sha256Hex(pinHashInput(formatStudyName(name), cleanPin))
  if (enteredHash !== existingHash) throw new Error('PIN incorreto.')
}

function studyDate(timestamp: number) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp))
}

function splitByBrazilianMidnight(start: number, end: number) {
  const slices: Array<{ date: string; ms: number }> = []
  let cursor = start
  while (cursor < end) {
    const date = studyDate(cursor)
    let sliceEnd = end
    if (studyDate(end - 1) !== date) {
      let low = cursor
      let high = end
      while (high - low > 1) {
        const middle = Math.floor((low + high) / 2)
        if (studyDate(middle) === date) low = middle
        else high = middle
      }
      sliceEnd = high
    }
    slices.push({ date, ms: sliceEnd - cursor })
    cursor = sliceEnd
  }
  return slices
}

async function readLiveSession(id: string) {
  const response = await rankFetch(databaseUrl + '/live/' + encodeURIComponent(id) + '.json', { cache: 'no-store' })
  if (!response.ok) throw new Error('Não consegui consultar essa sessão no RankEstudos.')
  return (await response.json()) as LiveStudyRecord | null
}

export async function startLiveStudySession(name: string, pin: string, confirmation: string) {
  const cleanName = formatStudyName(name)
  if (!cleanName) throw new Error('Entre na sala com seu nome antes de começar a estudar.')
  const existingPin = await readPinHash(cleanName)
  if (existingPin) await verifyExistingStudyPin(cleanName, pin)
  else if (pin.trim() || confirmation.trim()) await verifyOrCreateStudyPin(cleanName, pin, confirmation, true)

  const existing = (await fetchLiveStudySessions())
    .filter((session) => normalizeName(session.name) === normalizeName(cleanName))
    .sort((a, b) => Number(b.runningSince) - Number(a.runningSince))[0]
  if (existing) return { session: existing, alreadyActive: true }

  const now = Date.now()
  const response = await rankFetch(databaseUrl + '/live.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: cleanName, accumulated: 0, runningSince: now, startedAt: now, pausedAt: 0 }),
  })
  if (!response.ok) throw new Error('O RankEstudos não conseguiu iniciar o cronômetro.')
  const result = (await response.json()) as { name?: string }
  if (!result.name) throw new Error('O RankEstudos não confirmou o cronômetro.')
  return {
    session: { id: result.name, name: cleanName, accumulated: 0, runningSince: now, pausedAt: 0, startedAt: now },
    alreadyActive: false,
  }
}

export async function toggleLiveStudyPause(name: string, id: string, pin: string) {
  await verifyExistingStudyPin(name, pin)
  const session = await readLiveSession(id)
  if (!session || normalizeName(String(session.name || '')) !== normalizeName(name)) {
    throw new Error('Esse cronômetro não está mais ativo no RankEstudos.')
  }
  const now = Date.now()
  const accumulated = Math.max(0, Number(session.accumulated) || 0)
  const runningSince = Math.max(0, Number(session.runningSince) || 0)
  const patch = runningSince > 0
    ? { accumulated: accumulated + now - runningSince, runningSince: 0, pausedAt: now }
    : { runningSince: now, pausedAt: 0 }
  const response = await rankFetch(databaseUrl + '/live/' + encodeURIComponent(id) + '.json', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!response.ok) throw new Error('Não consegui atualizar o cronômetro no RankEstudos.')
}

export async function stopLiveStudySession(name: string, id: string, pin: string) {
  await verifyExistingStudyPin(name, pin)
  const session = await readLiveSession(id)
  if (!session || normalizeName(String(session.name || '')) !== normalizeName(name)) {
    throw new Error('Esse cronômetro não está mais ativo no RankEstudos.')
  }

  const now = Date.now()
  const accumulated = Math.max(0, Number(session.accumulated) || 0)
  const runningSince = Math.max(0, Number(session.runningSince) || 0)
  const elapsedMs = accumulated + (runningSince > 0 ? Math.max(0, now - runningSince) : 0)
  if (elapsedMs < 60_000) {
    const response = await rankFetch(databaseUrl + '/live/' + encodeURIComponent(id) + '.json', { method: 'DELETE' })
    if (!response.ok) throw new Error('Não consegui encerrar a sessão no RankEstudos.')
    return { elapsedMs, saved: false }
  }

  const virtualStart = now - elapsedMs
  const slices = splitByBrazilianMidnight(virtualStart, now)
    .map((slice) => ({ ...slice, hours: Math.round((slice.ms / 3_600_000) * 100) / 100 }))
    .filter((slice) => slice.hours > 0)
  const cleanName = formatStudyName(name)
  for (const slice of slices) {
    const entryId = 'skyoffice_' + id + '_' + slice.date
    const response = await rankFetch(databaseUrl + '/entries/' + encodeURIComponent(entryId) + '.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cleanName,
        date: slice.date,
        hours: slice.hours,
        questions: 0,
        flashcards: 0,
        corrections: 0,
        aula: 0,
        ts: { '.sv': 'timestamp' },
      }),
    })
    if (!response.ok) throw new Error('O RankEstudos não conseguiu salvar as horas. A sessão continua aberta para tentar novamente.')
  }

  // Entries use a stable key per live session and day, so retrying after a
  // network failure cannot add the same study time twice.
  await rankFetch(databaseUrl + '/live/' + encodeURIComponent(id) + '.json', { method: 'DELETE' })
  return { elapsedMs, saved: true }
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
    const pinResponse = await rankFetch(`${databaseUrl}/pins/${encodeURIComponent(cleanName)}.json`, {
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
  const entryResponse = await rankFetch(`${databaseUrl}/entries.json`, {
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
