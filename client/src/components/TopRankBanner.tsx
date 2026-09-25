import React, { useEffect, useState } from 'react'
import styled from 'styled-components'
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded'

import { fetchTodayStudyLeaderboard, StudyLeaderboardEntry } from '../services/RankEstudosLive'
import { Event, phaserEvents } from '../events/EventCenter'

const Banner = styled.div`
  position: fixed;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 10px;
  width: min(360px, calc(100vw - 28px));
  min-height: 58px;
  padding: 8px 14px 8px 9px;
  overflow: hidden;
  pointer-events: none !important;
  border: 1px solid rgba(245, 193, 68, .38);
  border-radius: 17px;
  background: linear-gradient(110deg, rgba(25, 24, 31, .96), rgba(33, 30, 35, .93) 62%, rgba(58, 44, 23, .9));
  box-shadow: 0 12px 28px rgba(0, 0, 0, .3), 0 0 0 1px rgba(255, 255, 255, .035) inset;
  color: #f7f4ed;
  backdrop-filter: blur(16px) saturate(125%);

  &::after {
    content: '';
    position: absolute;
    top: 0;
    right: 24px;
    width: 105px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 226, 137, .85), transparent);
  }

  @media (max-width: 540px) {
    top: 8px;
    min-height: 52px;
    padding-right: 11px;
    border-radius: 14px;
  }
`

const Trophy = styled.div`
  display: grid;
  place-items: center;
  flex: 0 0 39px;
  width: 39px;
  height: 39px;
  border: 1px solid rgba(255, 220, 112, .52);
  border-radius: 12px;
  background: linear-gradient(145deg, #f5c64c, #b8781f);
  color: #3b250d;
  box-shadow: 0 5px 12px rgba(0, 0, 0, .28), 0 0 16px rgba(245, 190, 58, .16);
  svg { font-size: 23px; }
`

const Copy = styled.div`
  min-width: 0;
  flex: 1;
  line-height: 1.12;
`

const Eyebrow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  color: #eacb7a;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .15em;
  text-transform: uppercase;
`

const Dot = styled.span`
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #f6c84c;
  box-shadow: 0 0 8px rgba(246, 200, 76, .7);
`

const Name = styled.div`
  overflow: hidden;
  color: #fff;
  font-size: 14px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Score = styled.div`
  flex: 0 0 auto;
  padding-left: 10px;
  border-left: 1px solid rgba(255, 255, 255, .12);
  color: #ffe18a;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -.02em;
  white-space: nowrap;
  small {
    display: block;
    margin-top: 2px;
    color: #aaa5a0;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: .03em;
    text-align: right;
  }
`

function formatHours(hours: number) {
  const wholeHours = Math.floor(hours)
  const minutes = Math.round((hours - wholeHours) * 60)
  if (wholeHours > 0) return `${wholeHours}h ${String(minutes).padStart(2, '0')}m`
  return `${minutes} min`
}

export default function TopRankBanner() {
  const [leader, setLeader] = useState<StudyLeaderboardEntry | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const [top] = await fetchTodayStudyLeaderboard()
        if (active) setLeader(top || null)
      } catch {
        if (active) setLeader(null)
      }
    }
    const refreshAfterEntry = () => { void refresh() }
    void refresh()
    phaserEvents.on(Event.RANK_ESTUDOS_UPDATED, refreshAfterEntry)
    const interval = window.setInterval(() => { void refresh() }, 10_000)
    return () => {
      active = false
      phaserEvents.off(Event.RANK_ESTUDOS_UPDATED, refreshAfterEntry)
      window.clearInterval(interval)
    }
  }, [])

  return (
    <Banner aria-label={leader ? `Top 1 de hoje: ${leader.name}, ${formatHours(leader.hours)}` : 'Top 1 de hoje'}>
      <Trophy aria-hidden="true"><EmojiEventsRoundedIcon /></Trophy>
      <Copy>
        <Eyebrow><Dot /> Top 1 · hoje</Eyebrow>
        <Name>{leader?.name || (leader === undefined ? 'Atualizando ranking…' : 'Ainda sem líder hoje')}</Name>
      </Copy>
      <Score>
        {leader ? formatHours(leader.hours) : '—'}
        <small>{leader ? 'tempo estudado' : 'lance suas horas'}</small>
      </Score>
    </Banner>
  )
}
