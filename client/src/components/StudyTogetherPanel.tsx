import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Popover from '@mui/material/Popover'
import Tooltip from '@mui/material/Tooltip'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import RefreshIcon from '@mui/icons-material/Refresh'
import {
  fetchLiveStudySessions,
  fetchTodayGroupStudyHours,
  hasStudyPin,
  startLiveStudySession,
  toggleLiveStudyPause,
  stopLiveStudySession,
  type LiveStudySession,
} from '../services/RankEstudosLive'
import { Event, phaserEvents } from '../events/EventCenter'

interface Props { playerName: string }
type FormMode = 'start' | 'control' | null

// Keep the PIN only in page memory: panel remounts retain it, a full reload clears it.
const studyPinCache = new Map<string, string>()
const pinCacheKey = (name: string) => normalize(name)

const normalize = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
const formatTimer = (ms: number) => {
  const total = Math.floor(Math.max(0, ms) / 1000)
  return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
const formatHours = (hours: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(hours)

export default function StudyTogetherPanel({ playerName }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [sessions, setSessions] = useState<LiveStudySession[]>([])
  const [todayHours, setTodayHours] = useState(0)
  const [clock, setClock] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pinExists, setPinExists] = useState<boolean | null>(null)
  const [pin, setPin] = useState(() => studyPinCache.get(pinCacheKey(playerName)) ?? '')
  const [confirmation, setConfirmation] = useState('')
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [controlAction, setControlAction] = useState<'pause' | 'stop'>('pause')

  const ownSession = useMemo(() => sessions
    .filter((session) => normalize(session.name) === normalize(playerName))
    .sort((a, b) => b.startedAt - a.startedAt)[0], [sessions, playerName])

  const refresh = useCallback(async (includeHours = false) => {
    try {
      const current = await fetchLiveStudySessions()
      setSessions(current.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui atualizar quem está estudando.')
    }
    if (includeHours) {
      try { setTodayHours(await fetchTodayGroupStudyHours()) }
      catch (err) { setError(err instanceof Error ? err.message : 'Não consegui atualizar as horas do grupo.') }
    }
  }, [])

  useEffect(() => {
    void refresh(true)
    const poll = window.setInterval(() => { void refresh(false) }, 5000)
    const hoursPoll = window.setInterval(() => { void refresh(true) }, 60_000)
    const tick = window.setInterval(() => setClock(Date.now()), 1000)
    return () => { window.clearInterval(poll); window.clearInterval(hoursPoll); window.clearInterval(tick) }
  }, [refresh])

  useEffect(() => {
    setPin(studyPinCache.get(pinCacheKey(playerName)) ?? '')
    if (!playerName) { setPinExists(null); return }
    let active = true
    hasStudyPin(playerName).then((exists) => { if (active) setPinExists(exists) })
      .catch(() => { if (active) setPinExists(null) })
    return () => { active = false }
  }, [playerName])

  const openStart = () => {
    setError(''); setNotice(''); setConfirmation(''); setFormMode('start')
  }
  const beginAction = (action: 'pause' | 'stop') => {
    setError(''); setNotice(''); setConfirmation(''); setControlAction(action)
    const cachedPin = studyPinCache.get(pinCacheKey(playerName))
    if (cachedPin) { void runAction(action, cachedPin); return }
    if (pinExists !== false) setFormMode('control')
    else void runAction(action, '')
  }

  const runAction = async (action: 'pause' | 'stop', enteredPin: string) => {
    if (!ownSession) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (action === 'pause') await toggleLiveStudyPause(playerName, ownSession.id, enteredPin)
      else {
        const result = await stopLiveStudySession(playerName, ownSession.id, enteredPin)
        if (!result.saved) setNotice('Sessões com menos de 1 minuto não são lançadas no ranking.')
        else phaserEvents.emit(Event.RANK_ESTUDOS_UPDATED)
      }
      phaserEvents.emit(Event.STUDY_SESSIONS_REFRESH)
      if (enteredPin) {
        studyPinCache.set(pinCacheKey(playerName), enteredPin)
        setPin(enteredPin)
      }
      setFormMode(null); setConfirmation('')
      await refresh(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui atualizar o cronômetro.')
    } finally { setBusy(false) }
  }

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!playerName.trim()) { setError('Entre na sala com seu nome antes de começar.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      if (formMode === 'start') {
        const result = await startLiveStudySession(playerName, pin, confirmation)
        if (pin.trim()) studyPinCache.set(pinCacheKey(playerName), pin.trim())
        setNotice(result.alreadyActive ? 'Seu cronômetro do RankEstudos já estava ativo.' : 'Cronômetro iniciado no RankEstudos.')
        if (!result.alreadyActive) phaserEvents.emit(Event.STUDY_SESSION_STARTED, playerName)
        setFormMode(null); setConfirmation('')
        await refresh(true)
      } else if (formMode === 'control') await runAction(controlAction, pin)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui iniciar o cronômetro.')
    } finally { setBusy(false) }
  }

  const startWithoutPin = async () => {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await startLiveStudySession(playerName, '', '')
      setFormMode(null)
      setNotice(result.alreadyActive ? 'Seu cronômetro do RankEstudos já estava ativo.' : 'Cronômetro iniciado no RankEstudos.')
      if (!result.alreadyActive) phaserEvents.emit(Event.STUDY_SESSION_STARTED, playerName)
      await refresh(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui iniciar o cronômetro.')
    } finally { setBusy(false) }
  }

  const pinFields = (isStart: boolean) => <>
    <TextField
      fullWidth size="small" label={pinExists ? 'PIN do RankEstudos' : isStart ? 'Criar PIN (opcional)' : 'PIN do RankEstudos'}
      type="password" value={pin} onChange={(e) => setPin(e.target.value)}
      inputProps={{ inputMode: 'numeric', maxLength: 6, pattern: '[0-9]*' }}
      sx={{ mt: 1.2, '& .MuiInputBase-root': { color: '#eee', bgcolor: '#191a20' }, '& .MuiInputLabel-root': { color: '#a8abb4' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#383a43' } }}
    />
    {isStart && pinExists === false && <TextField
      fullWidth size="small" label="Confirme o PIN" type="password" value={confirmation}
      onChange={(e) => setConfirmation(e.target.value)} inputProps={{ inputMode: 'numeric', maxLength: 6, pattern: '[0-9]*' }}
      sx={{ mt: 1, '& .MuiInputBase-root': { color: '#eee', bgcolor: '#191a20' }, '& .MuiInputLabel-root': { color: '#a8abb4' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#383a43' } }}
    />}
    {isStart && pinExists === false && <div style={{ color: '#a8abb4', fontSize: 12, marginTop: 8 }}>Você também pode começar sem PIN, como no RankEstudos.</div>}
  </>

  const ownPaused = Boolean(ownSession?.pausedAt) || !ownSession?.runningSince
  const ownElapsed = ownSession ? ownSession.accumulated + (ownSession.runningSince > 0 ? Math.max(0, clock - ownSession.runningSince) : 0) : 0

  return <>
    <Tooltip title={ownSession ? 'Você está estudando · abrir sala de estudo' : 'Estudar junto · abrir sala de estudo'}>
      <button type="button" aria-label="Estudar junto" onClick={(e) => { setAnchor(e.currentTarget); void refresh(true) }} style={{
        position: 'relative', width: 34, height: 34, border: '1px solid #343746', borderRadius: 11,
        background: anchor ? '#30345d' : '#242633', color: ownSession ? '#75dfc8' : '#c8cad4',
        display: 'grid', placeItems: 'center', cursor: 'pointer', flex: '0 0 auto',
      }}>
        <MenuBookIcon fontSize="small" />
        {sessions.length > 0 && <span style={{ position: 'absolute', right: -5, top: -5, minWidth: 15, height: 15, borderRadius: 9, padding: '0 3px', background: '#09a878', color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: '15px' }}>{sessions.length}</span>}
      </button>
    </Tooltip>
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} transformOrigin={{ vertical: 'bottom', horizontal: 'center' }} PaperProps={{ sx: { width: 350, maxWidth: 'calc(100vw - 24px)', p: 2, mb: 1, bgcolor: '#17181e', color: '#ececf1', border: '1px solid #32343d', borderRadius: 3, boxShadow: '0 16px 48px rgba(0,0,0,.55)' } }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Estudando agora <span style={{ color: '#8f929c' }}>({sessions.length})</span></div>
        <IconButton size="small" aria-label="Atualizar" onClick={() => void refresh(true)} sx={{ color: '#aeb1bc' }}><RefreshIcon fontSize="small" /></IconButton>
      </div>
      <div style={{ color: '#9699a4', fontSize: 12, marginBottom: 12 }}>Um espaço para sentar, focar e estudar junto.</div>
      <div style={{ maxHeight: 235, overflowY: 'auto', margin: '0 -5px', padding: '0 5px' }}>
        {sessions.length === 0 ? <div style={{ padding: '14px 4px', color: '#9699a4', fontSize: 13 }}>Ninguém começou ainda. Seja a primeira pessoa!</div> : sessions.map((session) => {
          const paused = Boolean(session.pausedAt) || !session.runningSince
          const elapsed = session.accumulated + (session.runningSince > 0 ? Math.max(0, clock - session.runningSince) : 0)
          const isMine = normalize(session.name) === normalize(playerName)
          return <div key={session.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: '1px solid #282a32' }}>
            <span style={{ width: 29, height: 29, flex: '0 0 29px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: isMine ? '#27695d' : '#30323c', color: '#e8e9ee', fontSize: 13, fontWeight: 700 }}>{session.name.trim().charAt(0).toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.name}{isMine ? ' (você)' : ''}</div><div style={{ fontSize: 11, color: paused ? '#d4aa61' : '#64caa9' }}>{paused ? 'Pausado' : 'Estudando'}</div></div>
            <code style={{ color: '#f0f0f4', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{formatTimer(elapsed)}</code>
            {isMine && <div style={{ display: 'flex', gap: 2 }}>
              <Tooltip title={paused ? 'Continuar' : 'Pausar'}><span><IconButton size="small" aria-label={paused ? 'Continuar' : 'Pausar'} disabled={busy} onClick={() => beginAction('pause')} sx={{ color: '#d5d7df' }}>{paused ? <PlayArrowIcon fontSize="small" /> : <PauseIcon fontSize="small" />}</IconButton></span></Tooltip>
              <Tooltip title="Parar e lançar no RankEstudos"><span><IconButton size="small" aria-label="Parar cronômetro" disabled={busy} onClick={() => beginAction('stop')} sx={{ color: '#ff8176' }}><StopIcon fontSize="small" /></IconButton></span></Tooltip>
            </div>}
          </div>
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', color: '#c7c9d1', fontSize: 12 }}>
        <span>Horas lançadas pelo grupo hoje</span><strong style={{ color: '#72d7c0', fontSize: 14 }}>{formatHours(todayHours)} h</strong>
      </div>
      {error && <Alert severity="error" sx={{ mb: 1, bgcolor: '#3b2025', color: '#ffd9de', '& .MuiAlert-icon': { color: '#ff8b97' } }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 1, bgcolor: '#18342e', color: '#d2fff2', '& .MuiAlert-icon': { color: '#70dabb' } }}>{notice}</Alert>}
    {formMode ? <form onSubmit={(e) => void submitForm(e)}>
        <div style={{ fontWeight: 650, fontSize: 13 }}>{formMode === 'start' ? 'Começar a estudar' : controlAction === 'stop' ? 'Parar o cronômetro' : ownPaused ? 'Continuar estudando' : 'Pausar estudo'}</div>
        {(formMode === 'control' && !studyPinCache.has(pinCacheKey(playerName)) || formMode === 'start' && pinExists !== null && !studyPinCache.has(pinCacheKey(playerName))) ? pinFields(formMode === 'start') : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {formMode === 'start' && pinExists === false ? <>
            <Button type="submit" disabled={busy || !/^\d{4,6}$/.test(pin.trim()) || confirmation.trim() !== pin.trim()} variant="contained" size="small" sx={{ flex: 1, bgcolor: '#343b9b', textTransform: 'none' }}>{busy ? 'Iniciando…' : 'Criar PIN e começar'}</Button>
            <Button type="button" disabled={busy} onClick={() => { setPin(''); setConfirmation(''); void startWithoutPin() }} variant="outlined" size="small" sx={{ color: '#d6d8e0', borderColor: '#454752', textTransform: 'none' }}>{busy ? 'Conectando…' : 'Sem PIN'}</Button>
          </> : <Button type="submit" disabled={busy || pinExists === true && pin.trim().length === 0} variant="contained" size="small" sx={{ flex: 1, bgcolor: controlAction === 'stop' && formMode === 'control' ? '#a7483c' : '#343b9b', textTransform: 'none' }}>{busy ? formMode === 'start' ? 'Conectando…' : 'Salvando…' : formMode === 'start' ? 'Começar' : 'Confirmar'}</Button>}
          <Button type="button" disabled={busy} onClick={() => setFormMode(null)} size="small" sx={{ color: '#b6b8c1', textTransform: 'none' }}>Cancelar</Button>
        </div>
      </form> : !ownSession ? <Button fullWidth variant="contained" onClick={openStart} disabled={!playerName.trim() || pinExists === null} sx={{ mt: 0.5, bgcolor: '#343b9b', borderRadius: 2, textTransform: 'none', fontWeight: 650 }}>{pinExists === null ? 'Conectando ao RankEstudos…' : 'Começar a estudar'}</Button> : <div style={{ paddingTop: 1, color: '#9699a4', fontSize: 11 }}>Seu cronômetro está {ownPaused ? 'pausado' : 'rodando'} no RankEstudos · {formatTimer(ownElapsed)}</div>}
      <div style={{ borderTop: '1px solid #292b33', marginTop: 13, paddingTop: 10, color: '#828590', fontSize: 11 }}>O cronômetro é sincronizado com “Estudando agora” no RankEstudos. Chegou, começou — sem matéria nem meta.</div>
    </Popover>
  </>
}
