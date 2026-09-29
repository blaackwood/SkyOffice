import React, { useEffect, useState } from 'react'
import styled from 'styled-components'
import { useAppSelector } from '../hooks'
import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

const SUBJECTS = [
  'Matemática', 'Português', 'Redação', 'Literatura', 'Biologia', 'Física',
  'Química', 'História', 'Geografia', 'Filosofia', 'Sociologia', 'Inglês',
  'Espanhol', 'Artes', 'Educação Física',
]

const Section = styled.section`
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #414760;
  h3 { margin: 0 0 8px; font-size: 14px; }
  p { font-size: 12px; color: #c7cae3; }
  input, select { box-sizing: border-box; width: 100%; margin: 4px 0; padding: 8px; color: white; background: #30354b; border: 1px solid #596078; border-radius: 6px; }
  button { margin: 6px 6px 0 0; padding: 7px 10px; color: white; background: #30354b; border: 1px solid #596078; border-radius: 6px; cursor: pointer; }
`

export default function ActivityStatus(): JSX.Element {
  const saved = useAppSelector(state => state.user.myActivity)
  const [subject, setSubject] = useState('')
  const [custom, setCustom] = useState(false)
  useEffect(() => {
    try {
      const label = saved ? String(JSON.parse(saved).label || '') : ''
      const selected = ['Estudando', 'Fazendo simulado'].includes(label) ? '' : label
      setSubject(selected)
      setCustom(Boolean(selected) && !SUBJECTS.includes(selected))
    } catch { setSubject(''); setCustom(false) }
  }, [saved])
  const save = (label: string) => {
    const game = phaserGame.scene.keys.game as Game | undefined
    game?.network?.updatePlayerActivity('subject', label.trim())
  }
  return <Section onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}>
    <h3>Matéria</h3>
    <select aria-label="Matéria" value={custom ? 'custom' : subject} onChange={event => {
      const value = event.target.value
      setCustom(value === 'custom')
      setSubject(value === 'custom' ? '' : value)
      if (value !== 'custom') save(value)
    }}>
      <option value="">Selecione a matéria</option>
      {SUBJECTS.map(label => <option key={label} value={label}>{label}</option>)}
      <option value="custom">Outra matéria…</option>
    </select>
    {custom && <>
      <input aria-label="Outra matéria" placeholder="Nome da matéria" maxLength={48} value={subject} onChange={event => setSubject(event.target.value)} />
      <button disabled={!subject.trim()} onClick={() => save(subject)}>Salvar matéria</button>
    </>}
    <button onClick={() => { setSubject(''); setCustom(false); save('') }}>Limpar</button>
    <p>O status e o tempo vêm automaticamente do RankEstudos pelo seu nome. A matéria aparece abaixo de “Estudando”.</p>
  </Section>
}
