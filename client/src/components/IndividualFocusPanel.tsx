import React, { useEffect, useState } from 'react'
import Popover from '@mui/material/Popover'
import styled from 'styled-components'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import StopIcon from '@mui/icons-material/Stop'
import ReplayIcon from '@mui/icons-material/Replay'

type Phase = 'focus' | 'shortBreak' | 'longBreak'
type Status = 'idle' | 'running' | 'paused' | 'completed'
type TimerState = {
  phase: Phase
  status: Status
  durationSeconds: number
  remainingSeconds: number
  endsAt?: number
}

const STORAGE_KEY = 'skyoffice.individualFocus.v1'
const PHASES: Record<Phase, { label: string; minutes: number }> = {
  focus: { label: 'Foco', minutes: 25 },
  shortBreak: { label: 'Pausa curta', minutes: 5 },
  longBreak: { label: 'Pausa longa', minutes: 15 },
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
  grid-template-columns: repeat(3, 1fr);
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
    if (!saved || !saved.phase || !saved.status || !Number.isFinite(saved.durationSeconds)) return defaultTimer()
    const durationSeconds = Math.max(60, Math.min(180 * 60, Number(saved.durationSeconds)))
    if (saved.status === 'running' && Number.isFinite(saved.endsAt)) {
      const remainingSeconds = Math.max(0, Math.ceil((Number(saved.endsAt) - Date.now()) / 1000))
      return { phase: saved.phase, status: remainingSeconds ? 'running' : 'completed', durationSeconds, remainingSeconds, endsAt: remainingSeconds ? saved.endsAt : undefined }
    }
    const remainingSeconds = Math.max(0, Math.min(durationSeconds, Number(saved.remainingSeconds ?? durationSeconds)))
    return { phase: saved.phase, status: saved.status, durationSeconds, remainingSeconds }
  } catch {
    return defaultTimer()
  }
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
  const isRunning = timer.status === 'running'

  useEffect(() => {
    setMinutes(Math.max(1, Math.round(timer.durationSeconds / 60)))
  }, [timer.durationSeconds])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(timer)) } catch { /* local persistence is optional */ }
  }, [timer])

  useEffect(() => {
    if (!isRunning || !timer.endsAt) return
    const tick = () => setTimer((current) => {
      if (current.status !== 'running' || !current.endsAt) return current
      const remainingSeconds = Math.max(0, Math.ceil((current.endsAt - Date.now()) / 1000))
      if (remainingSeconds === current.remainingSeconds && remainingSeconds > 0) return current
      return remainingSeconds === 0
        ? { ...current, status: 'completed', remainingSeconds: 0, endsAt: undefined }
        : { ...current, remainingSeconds }
    })
    tick()
    const interval = window.setInterval(tick, 250)
    return () => window.clearInterval(interval)
  }, [isRunning, timer.endsAt])

  const selectPhase = (phase: Phase) => {
    if (isRunning) return
    const durationSeconds = PHASES[phase].minutes * 60
    setTimer({ phase, status: 'idle', durationSeconds, remainingSeconds: durationSeconds })
  }

  const applyDuration = () => {
    if (isRunning || minutes < 1 || minutes > 180) return
    const durationSeconds = Math.round(minutes * 60)
    setTimer({ ...timer, status: 'idle', durationSeconds, remainingSeconds: durationSeconds, endsAt: undefined })
  }

  const start = () => {
    const remainingSeconds = timer.status === 'paused' ? timer.remainingSeconds : timer.durationSeconds
    setTimer({ ...timer, status: 'running', remainingSeconds, endsAt: Date.now() + remainingSeconds * 1000 })
  }

  const pause = () => {
    const remainingSeconds = Math.max(0, Math.ceil(((timer.endsAt ?? Date.now()) - Date.now()) / 1000))
    setTimer({ ...timer, status: remainingSeconds ? 'paused' : 'completed', remainingSeconds, endsAt: undefined })
  }

  const stop = () => setTimer({ ...timer, status: 'idle', remainingSeconds: timer.durationSeconds, endsAt: undefined })

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
        <Timer>{formatTime(timer.remainingSeconds)}</Timer>
        <StatusLine>{timer.status === 'running' ? 'Em andamento' : timer.status === 'paused' ? 'Pausado' : timer.status === 'completed' ? 'Tempo concluído' : 'Pronto para começar'}</StatusLine>
        <DurationRow>
          Duração
          <input aria-label="Duração do Pomodoro individual em minutos" type="number" min={1} max={180} value={minutes} disabled={isRunning} onChange={(event) => setMinutes(Number(event.target.value))} />
          min
          <SmallButton disabled={isRunning || minutes < 1 || minutes > 180} onClick={applyDuration}>Aplicar</SmallButton>
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
