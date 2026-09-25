import React, { useEffect, useState } from 'react'
import Popover from '@mui/material/Popover'
import styled from 'styled-components'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import StopIcon from '@mui/icons-material/Stop'
import ReplayIcon from '@mui/icons-material/Replay'
import Tooltip from '@mui/material/Tooltip'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { useAppSelector } from '../hooks'
import { FocusPhase } from '../../../types/IOfficeState'

const Panel = styled.div`
  width: 320px;
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
  &:disabled { opacity: 0.5; cursor: default; }
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
  input {
    width: 58px;
    padding: 6px;
    color: white;
    background: #30354b;
    border: 1px solid #414760;
    border-radius: 7px;
    text-align: center;
  }
`

const Controls = styled.div`
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 15px;
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 34px;
    padding: 0 12px;
    color: white;
    background: #30354b;
    border: 1px solid #414760;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
  }
  button.primary { color: #101b27; background: #05bdba; border-color: #05bdba; font-weight: 700; }
  button:disabled { opacity: 0.45; cursor: default; }
`

const phaseLabels: Record<FocusPhase, string> = {
  focus: 'Foco',
  shortBreak: 'Pausa curta',
  longBreak: 'Pausa longa',
}

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.ceil(totalSeconds))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

interface Props {
  anchorEl: HTMLButtonElement | null
  onClose: () => void
}

export default function GroupFocusPanel({ anchorEl, onClose }: Props) {
  const focus = useAppSelector((state) => state.focus.group)
  const [minutes, setMinutes] = useState(Math.round(focus.durationSeconds / 60))
  const isRunning = focus.status === 'running'
  const game = phaserGame.scene.keys.game as Game
  const network = game?.network

  useEffect(() => {
    setMinutes(Math.round(focus.durationSeconds / 60))
  }, [focus.durationSeconds])

  const send = (
    action: 'start' | 'pause' | 'resume' | 'stop' | 'reset' | 'phase' | 'duration',
    data: { phase?: FocusPhase; minutes?: number } = {}
  ) => network?.updateGroupFocus(action, data)

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Panel>
        <h2>Foco em grupo</h2>
        <div className="subtitle">O timer é compartilhado por quem está nesta sala.</div>

        <PhaseChoices>
          {(Object.keys(phaseLabels) as FocusPhase[]).map((phase) => (
            <SmallButton
              key={phase}
              selected={focus.phase === phase}
              disabled={isRunning}
              onClick={() => send('phase', { phase })}
            >
              {phaseLabels[phase]}
            </SmallButton>
          ))}
        </PhaseChoices>

        <Timer>{formatTime(focus.remainingSeconds)}</Timer>
        <StatusLine>
          {focus.status === 'running' && 'Em andamento'}
          {focus.status === 'paused' && 'Pausado'}
          {focus.status === 'completed' && 'Tempo concluído'}
          {focus.status === 'idle' && 'Pronto para começar'}
        </StatusLine>

        <DurationRow>
          Duração
          <input
            aria-label="Duração em minutos"
            type="number"
            min={1}
            max={180}
            value={minutes}
            disabled={isRunning}
            onChange={(event) => setMinutes(Number(event.target.value))}
          />
          min
          <SmallButton
            disabled={isRunning || minutes < 1 || minutes > 180}
            onClick={() => send('duration', { minutes })}
          >
            Aplicar
          </SmallButton>
        </DurationRow>

        <Controls>
          {focus.status === 'running' ? (
            <button onClick={() => send('pause')}><PauseIcon fontSize="small" /> Pausar</button>
          ) : (
            <button className="primary" onClick={() => send(focus.status === 'paused' ? 'resume' : 'start')}>
              <PlayArrowIcon fontSize="small" /> {focus.status === 'paused' ? 'Retomar' : 'Começar'}
            </button>
          )}
          <Tooltip title="Reiniciar fase">
            <span>
              <button disabled={isRunning} aria-label="Reiniciar fase" onClick={() => send('reset')}>
                <ReplayIcon fontSize="small" />
              </button>
            </span>
          </Tooltip>
          <button onClick={() => send('stop')}><StopIcon fontSize="small" /> Encerrar</button>
        </Controls>
      </Panel>
    </Popover>
  )
}
