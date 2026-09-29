import React, { useEffect, useRef, useState } from 'react'
import Popover from '@mui/material/Popover'
import styled from 'styled-components'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import StopIcon from '@mui/icons-material/Stop'
import ReplayIcon from '@mui/icons-material/Replay'

type Phase = 'focus' | 'shortBreak' | 'longBreak' | 'questions'
type Status = 'idle' | 'running' | 'paused' | 'completed'
type TimerState = {
  phase: Phase
  status: Status
  durationSeconds: number
  remainingSeconds: number
  endsAt?: number
  completedQuestions?: number
}

const STORAGE_KEY = 'skyoffice.individualFocus.v1'
const PHASES: Record<Phase, { label: string; minutes: number }> = {
  focus: { label: 'Foco', minutes: 25 },
  shortBreak: { label: 'Pausa curta', minutes: 5 },
  longBreak: { label: 'Pausa longa', minutes: 15 },
  questions: { label: 'Questões', minutes: 3.5 },
}

const Panel = styled.div`
  width: min(320px, calc(100vw - 24px));
  padding: 18px;
  color: #f5f6fa;
  background: #222639;
  border-radius: 14px;
  h2 { margin: 0; font-size: 17px; }
  .subtitle { margin-top: 4px; color: #aeb3ca; font-size: 12px; }
`
const PhaseChoices = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin: 16px 0;
`
const SmallButton = styled.button<{ selected?: boolean }>`
  padding: 8px 4px;
  color: ${(p) => (p.selected ? '#101b27' : '#d8dbeb')};
  background: ${(p) => (p.selected ? '#05bdba' : '#30354b')};
  border: 1px solid ${(p) => (p.selected ? '#05bdba' : '#414760')};
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  &:disabled { opacity: .5; cursor: default; }
`
const Timer = styled.div`
  margin: 12px 0 4px;
  text-align: center;
  font-size: 46px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
`
const StatusLine = styled.div`
  min-height: 18px;
  text-align: center;
  color: #aeb3ca;
  font-size: 12px;
`
const DurationRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
  color: #c7cae3;
  font-size: 12px;
  input { width: 58px; padding: 6px; color: white; background: #30354b; border: 1px solid #414760; border-radius: 7px; text-align: center; }
`
const Controls = styled.div`
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 15px;
  button {
    display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    min-height: 34px; padding: 0 12px; color: white; background: #30354b;
    border: 1px solid #414760; border-radius: 8px; cursor: pointer; font-size: 12px;
  }
  button.primary { color: #101b27; background: #05bdba; border-color: #05bdba; font-weight: 700; }
`

function defaultTimer(): TimerState {
  return { phase: 'focus', status: 'idle', durationSeconds: 25 * 60, remainingSeconds: 25 * 60 }
}

function loadTimer(): TimerState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Partial<TimerState> | null
    if (!saved || !saved.phase || !Object.prototype.hasOwnProperty.call(PHASES, saved.phase) || !saved.status || !['idle', 'running', 'paused', 'completed'].includes(saved.status) || !Number.isFinite(saved.durationSeconds)) return defaultTimer()
    const durationSeconds = Math.max(saved.phase === 'questions' ? 1 : 60, Math.min(180 * 60, Math.round(Number(saved.durationSeconds))))
    const completedQuestions = Number.isSafeInteger(saved.completedQuestions) && Number(saved.completedQuestions) >= 0 ? Number(saved.completedQuestions) : 0
    if (saved.status === 'running' && Number.isFinite(saved.endsAt)) {
      if (saved.phase === 'questions') {
        return advanceTimer({ phase: saved.phase, status: 'running', durationSeconds, remainingSeconds: durationSeconds, endsAt: saved.endsAt, completedQuestions }, Date.now())
      }
      const remainingSeconds = Math.max(0, Math.ceil((Number(saved.endsAt) - Date.now()) / 1000))
      return { phase: saved.phase, status: remainingSeconds ? 'running' : 'completed', durationSeconds, remainingSeconds, endsAt: remainingSeconds ? saved.endsAt : undefined }
    }
    const remainingSeconds = Math.max(0, Math.min(durationSeconds, Number(saved.remainingSeconds ?? durationSeconds)))
    return { phase: saved.phase, status: saved.status, durationSeconds, remainingSeconds, completedQuestions }
  } catch {
    return defaultTimer()
  }
}

export function advanceTimer(current: TimerState, now: number): TimerState {
  if (current.status !== 'running' || !current.endsAt) return current
  if (current.phase === 'questions' && now >= current.endsAt) {
    const elapsed = Math.floor((now - current.endsAt) / (current.durationSeconds * 1000)) + 1
    const endsAt = current.endsAt + elapsed * current.durationSeconds * 1000
    return { ...current, endsAt, remainingSeconds: Math.ceil((endsAt - now) / 1000), completedQuestions: (current.completedQuestions ?? 0) + elapsed }
  }
  const remainingSeconds = Math.max(0, Math.ceil((current.endsAt - now) / 1000))
  if (remainingSeconds === current.remainingSeconds && remainingSeconds > 0) return current
  return remainingSeconds === 0
    ? { ...current, status: 'completed', remainingSeconds: 0, endsAt: undefined }
    : { ...current, remainingSeconds }
}

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.ceil(totalSeconds))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

interface Props {
  anchorEl: HTMLButtonElement | null
  onClose: () => void
}

export default function IndividualFocusPanel({ anchorEl, onClose }: Props) {
  const [timer, setTimer] = useState<TimerState>(loadTimer)
  const [minutes, setMinutes] = useState(25)
  const [seconds, setSeconds] = useState(0)
  const audio = useRef<AudioContext | null>(null)
  const lastQuestion = useRef(timer.completedQuestions ?? 0)
  const [soundUnavailable, setSoundUnavailable] = useState(false)
  const isRunning = timer.status === 'running'
  const isQuestions = timer.phase === 'questions'

  useEffect(() => {
    setMinutes(Math.floor(timer.durationSeconds / 60))
    setSeconds(timer.durationSeconds % 60)
  }, [timer.durationSeconds])

  // Running countdowns can be restored from the deadline without writing every second.
  const persistedRemaining = isRunning ? undefined : timer.remainingSeconds
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        phase: timer.phase, status: timer.status, durationSeconds: timer.durationSeconds,
        remainingSeconds: persistedRemaining, endsAt: timer.endsAt, completedQuestions: timer.completedQuestions,
      }))
    } catch { /* local persistence is optional */ }
  }, [timer.phase, timer.status, timer.durationSeconds, timer.endsAt, timer.completedQuestions, persistedRemaining])

  useEffect(() => () => { void audio.current?.close().catch(() => undefined) }, [])

  useEffect(() => {
    const completed = timer.completedQuestions ?? 0
    if (completed > lastQuestion.current && isQuestions) {
      const context = audio.current
      if (context?.state === 'running') {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.frequency.value = 880
        gain.gain.setValueAtTime(0, context.currentTime)
        gain.gain.linearRampToValueAtTime(0.25, context.currentTime + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.6)
        oscillator.start()
        oscillator.stop(context.currentTime + 0.6)
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
      } else {
        setSoundUnavailable(true)
      }
    }
    lastQuestion.current = completed
  }, [timer.completedQuestions, isQuestions])

  useEffect(() => {
    if (!isRunning || !timer.endsAt) return
    const tick = () => setTimer((current) => advanceTimer(current, Date.now()))
    tick()
    const interval = window.setInterval(tick, 250)
    return () => window.clearInterval(interval)
  }, [isRunning, timer.endsAt])

  const selectPhase = (phase: Phase) => {
    if (isRunning) return
    const durationSeconds = PHASES[phase].minutes * 60
    setTimer({ phase, status: 'idle', durationSeconds, remainingSeconds: durationSeconds })
  }

  const draftDuration = minutes * 60 + (isQuestions ? seconds : 0)
  const validDuration = Number.isInteger(minutes) && Number.isInteger(seconds) && seconds >= 0 && seconds <= 59 && minutes >= 0 && draftDuration >= (isQuestions ? 1 : 60) && draftDuration <= 180 * 60
  const applyDuration = () => {
    if (isRunning || !validDuration) return
    const durationSeconds = draftDuration
    setTimer({ ...timer, status: 'idle', durationSeconds, remainingSeconds: durationSeconds, endsAt: undefined, completedQuestions: 0 })
  }

  const start = () => {
    if (isQuestions) {
      try {
        if (!audio.current || audio.current.state === 'closed') audio.current = new AudioContext()
        void audio.current.resume().then(() => setSoundUnavailable(false)).catch(() => setSoundUnavailable(true))
      } catch { setSoundUnavailable(true) }
    }
    const remainingSeconds = timer.status === 'paused' ? timer.remainingSeconds : timer.durationSeconds
    setTimer({ ...timer, status: 'running', remainingSeconds, endsAt: Date.now() + remainingSeconds * 1000 })
  }

  const pause = () => {
    const current = advanceTimer(timer, Date.now())
    setTimer({ ...current, status: current.remainingSeconds ? 'paused' : 'completed', endsAt: undefined })
  }

  const stop = () => setTimer({ ...timer, status: 'idle', remainingSeconds: timer.durationSeconds, endsAt: undefined, completedQuestions: 0 })

  return (
    <Popover open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={onClose} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Panel>
        <h2>Pomodoro individual</h2>
        <div className="subtitle">Seu timer é privado e não altera o foco do grupo.</div>
        <PhaseChoices>
          {(Object.keys(PHASES) as Phase[]).map((phase) => (
            <SmallButton key={phase} selected={timer.phase === phase} disabled={isRunning} onClick={() => selectPhase(phase)}>{PHASES[phase].label}</SmallButton>
          ))}
        </PhaseChoices>
        {isQuestions && <div className="subtitle">Um alerta toca ao fim de cada questão e o próximo intervalo começa automaticamente. Continua ao fechar este painel.</div>}
        <Timer>{formatTime(timer.remainingSeconds)}</Timer>
        {isQuestions && <StatusLine aria-live="polite">Questão {(timer.completedQuestions ?? 0) + 1} · {timer.completedQuestions ?? 0} intervalos concluídos</StatusLine>}
        {isQuestions && soundUnavailable && <div role="status" className="subtitle">Som indisponível. Pause e retome para ativar o alerta.</div>}
        <StatusLine>{timer.status === 'running' ? 'Em andamento' : timer.status === 'paused' ? 'Pausado' : timer.status === 'completed' ? 'Tempo concluído' : 'Pronto para começar'}</StatusLine>
        <DurationRow>
          Duração
          <input aria-label="Duração em minutos" type="number" min={isQuestions ? 0 : 1} max={180} value={minutes} disabled={isRunning} onChange={(event) => setMinutes(Number(event.target.value))} />
          min
          {isQuestions && <><input aria-label="Duração em segundos" type="number" min={0} max={59} value={seconds} disabled={isRunning} onChange={(event) => setSeconds(Number(event.target.value))} /> s</>}
          <SmallButton disabled={isRunning || !validDuration} onClick={applyDuration}>Aplicar</SmallButton>
        </DurationRow>
        <Controls>
          {isRunning ? <button onClick={pause}><PauseIcon fontSize="small" /> Pausar</button> : <button className="primary" onClick={start}><PlayArrowIcon fontSize="small" /> {timer.status === 'paused' ? 'Retomar' : 'Começar'}</button>}
          <button aria-label="Reiniciar Pomodoro individual" onClick={stop}><ReplayIcon fontSize="small" /> Reiniciar</button>
          <button onClick={onClose}><StopIcon fontSize="small" /> Fechar</button>
        </Controls>
      </Panel>
    </Popover>
  )
}
