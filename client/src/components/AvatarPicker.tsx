import React, { useEffect, useRef, useState } from 'react'
import './AvatarPicker.css'
import { AvatarChoice, AvatarPartId, normalizeAvatarParts } from '../avatarConfig'
import { atelierManifest, AVATAR_ROOT, DIRECTIONS, AvatarDirection, drawAvatarFrame, loadAvatarLayers } from '../services/AtelierAvatar'
const CATEGORIES: Array<{ id: AvatarPartId; slot: string; label: string; icon: string }> = [
  { id: 'skin', slot: 'skin', label: 'Pele', icon: '◉' },
  { id: 'hair', slot: 'hair', label: 'Cabelo', icon: '♟' },
  { id: 'top', slot: 'top', label: 'Blusa', icon: '♧' },
  { id: 'jacket', slot: 'jacket', label: 'Jaqueta', icon: '♧' },
  { id: 'bottom', slot: 'pants', label: 'Calça', icon: 'Ⅱ' },
  { id: 'shoes', slot: 'shoes', label: 'Calçados', icon: '▱' },
  { id: 'hat', slot: 'hat', label: 'Chapéu', icon: '⌂' },
  { id: 'glasses', slot: 'glasses', label: 'Óculos', icon: '∞' },
]
export function AvatarThumbnail({ parts }: { parts: AvatarChoice['parts'] }) {
  return <AvatarPreview parts={parts} direction="down" />
}
function AvatarPreview({ parts, direction }: { parts: AvatarChoice['parts']; direction: AvatarDirection }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState(false)
  const serialized = JSON.stringify(normalizeAvatarParts(parts))
  useEffect(() => {
    let cancelled = false
    setError(false)
    // Drop the previous pose while switching pieces; publish a complete frame
    // only after all layers for the latest selection have loaded.
    ref.current?.getContext('2d')?.clearRect(0, 0, 128, 192)
    loadAvatarLayers(JSON.parse(serialized), [direction]).then(loaded => {
      if (cancelled) return
      const canvas = ref.current!
      const ctx = canvas.getContext('2d')!
      const buffer = document.createElement('canvas')
      buffer.width = 128; buffer.height = 192
      const bufferContext = buffer.getContext('2d')!
      drawAvatarFrame(bufferContext, loaded, direction, 0, 128)
      ctx.clearRect(0, 0, 128, 192)
      ctx.drawImage(buffer, 0, 0)
    }).catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [serialized, direction])
  return <><canvas ref={ref} width={128} height={192} aria-label="Prévia do avatar" />{error && <span role="alert">Não foi possível carregar a prévia. Selecione a peça novamente.</span>}</>
}
type Props = { value: AvatarChoice; onChange: (value: AvatarChoice) => void; playerName?: string }
export default function AvatarPicker({ value, onChange, playerName = 'Você' }: Props) {
  const [category, setCategory] = useState<AvatarPartId>('skin')
  const [direction, setDirection] = useState<AvatarDirection>('down')
  const selected = CATEGORIES.find(item => item.id === category)!
  const parts = normalizeAvatarParts(value.parts)
  const female = parts.skin?.startsWith('skin_female_') || false
  const items = atelierManifest.items.filter(item => item.slot === selected.slot &&
    (selected.slot !== 'skin' || item.id.startsWith('skin_female_') === female))
  const chooseBase = (nextFemale: boolean) => {
    const tone = parts.skin?.slice(-2) || '02'
    onChange({ avatar: 'atelier', tint: 0xffffff, parts: {
      ...parts, skin: (nextFemale ? 'skin_female_' : 'skin_') + tone,
    } })
  }
  const selectedId = parts[category]
  const optional = !['skin', 'bottom', 'shoes', 'top'].includes(category)
  const choose = (id: string) => onChange({ avatar: 'atelier', tint: 0xffffff, parts: { ...parts, [category]: id } })
  return <div className="avatar-editor" onWheel={event => event.stopPropagation()}>
    <nav className="avatar-editor__sidebar">{CATEGORIES.map(item => <button key={item.id} type="button" className={'avatar-editor__category' + (category === item.id ? ' is-active' : '')} onClick={() => setCategory(item.id)}><span aria-hidden="true">{item.icon}</span><span>{item.label}</span></button>)}</nav>
    <main className="avatar-editor__catalog">
      <div className="avatar-editor__base" role="group" aria-label="Base do personagem">
        <button type="button" aria-pressed={!female} onClick={() => chooseBase(false)}>Masculina</button>
        <button type="button" aria-pressed={female} onClick={() => chooseBase(true)}>Feminina</button>
      </div>
      <div className="avatar-editor__title">{selected.label}</div>
      <div className="avatar-editor__grid" key={category}>
        {optional && <button type="button" className={'avatar-editor__none' + (!selectedId ? ' is-selected' : '')} onClick={() => choose('')}><span>×</span>Sem item{!selectedId && <i>✓</i>}</button>}
        {items.map(item => <button key={item.id} type="button" title={item.label} aria-label={item.label} aria-pressed={item.id === selectedId} className={'avatar-editor__item' + (item.id === selectedId ? ' is-selected' : '')} onClick={() => choose(item.id)}><img src={AVATAR_ROOT + item.directions.down.item} alt={item.label} loading="lazy" /><small>{item.label}</small>{item.id === selectedId && <i>✓</i>}</button>)}
      </div>
      {category === 'skin' && <div className="avatar-editor__swatches" aria-label="Tons de pele">{items.map((item, i) => <button key={item.id} type="button" title={item.label} aria-label={item.label} className={'avatar-editor__swatch' + (item.id === selectedId ? ' is-active' : '')} style={{ background: ['#f3d4b7', '#dfb28c', '#c08b62', '#a47251', '#80523a', '#573829'][i] }} onClick={() => choose(item.id)} />)}</div>}
    </main>
    <aside className="avatar-editor__preview"><span className="avatar-editor__name-tag"><i />{playerName}</span><AvatarPreview parts={parts} direction={direction} />
      <div className="avatar-editor__controls">{DIRECTIONS.map(dir => <button key={dir} type="button" aria-label={{down:'Ver de frente',up:'Ver de costas',left:'Ver lado esquerdo',right:'Ver lado direito'}[dir]} aria-pressed={direction === dir} onClick={() => setDirection(dir)}>{{down:'↓',up:'↑',left:'←',right:'→'}[dir]}</button>)}</div>
    </aside>
  </div>
}
