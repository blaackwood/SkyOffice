import React, { useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import Button from '@mui/material/Button'
import AvatarPicker from './AvatarPicker'
import { AvatarChoice, DEFAULT_AVATAR_CHOICE, loadSavedAvatar, saveAvatar } from '../avatarConfig'
import { loadAvatarByName, saveAvatarByName } from '../services/AvatarPersistence'
import { useAppDispatch, useAppSelector } from '../hooks'
import { setLoggedIn, setMyPlayerName } from '../stores/UserStore'
import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { formatStudyName } from '../services/RankEstudosLive'
import { takePreviewMediaStream } from '../services/PrejoinMedia'
import { primeChatNotificationSound } from '../services/ChatNotificationSound'

const Wrapper = styled.form`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  min-width: 330px;
  padding: 30px 36px;
  border-radius: 16px;
  color: #eee;
  background: #222639;
  box-shadow: 0 0 5px #0000006f;

  h2 { margin: 0; font-size: 20px; font-weight: 500; }
  h3 { margin: 0; font-size: 14px; font-weight: 600; color: #c2c6d2; }
`

export default function LoginDialog() {
  const [name] = useState(() => formatStudyName(sessionStorage.getItem('skyoffice.pendingPlayerName') || ''))
  const [avatarChoice, setAvatarChoice] = useState<AvatarChoice>(() => loadSavedAvatar(name) || DEFAULT_AVATAR_CHOICE)
  const [hasSavedAvatar, setHasSavedAvatar] = useState(() => Boolean(loadSavedAvatar(name)))
  const [avatarLoading, setAvatarLoading] = useState(Boolean(name))
  const [joining, setJoining] = useState(false)
  const [entryError, setEntryError] = useState('')
  const joiningRef = useRef(false)
  const dispatch = useAppDispatch()
  const roomJoined = useAppSelector((state) => state.room.roomJoined)

  useEffect(() => {
    let active = true
    const local = loadSavedAvatar(name)
    if (local) setAvatarChoice(local)
    setHasSavedAvatar(Boolean(local))
    if (!name) {
      setAvatarLoading(false)
      return () => { active = false }
    }
    setAvatarLoading(true)
    loadAvatarByName(name).then((saved) => {
      if (!active || !saved) return
      setAvatarChoice(saved)
      setHasSavedAvatar(true)
      saveAvatar(name, saved)
    }).catch(() => {
      // Keep the local profile when the remote lookup is unavailable.
    }).finally(() => { if (active) setAvatarLoading(false) })
    return () => { active = false }
  }, [name])

  const enterOffice = useCallback(async () => {
    if (!name || !roomJoined || avatarLoading || joiningRef.current) return
    joiningRef.current = true
    setJoining(true)
    setEntryError('')
    try {
      const game = phaserGame.scene.keys.game as Game
      if (!game?.myPlayer || !game.network) throw new Error('O mapa ainda está carregando. Tente novamente.')
      primeChatNotificationSound()
      saveAvatar(name, avatarChoice)
      if (!hasSavedAvatar) {
        void saveAvatarByName(name, avatarChoice).catch((error) => console.warn('Falha ao sincronizar avatar pelo nome', error))
      }
      game.registerKeys()
      game.myPlayer.setPlayerName(name)
      dispatch(setMyPlayerName(name))
      game.myPlayer.setPlayerTexture(avatarChoice.avatar === 'custom' ? DEFAULT_AVATAR_CHOICE.avatar : avatarChoice.avatar)
      game.myPlayer.setPlayerTint(avatarChoice.tint)
      game.myPlayer.setAvatarAppearance(JSON.stringify(avatarChoice.parts || {}))
      game.network.updatePlayerAppearance(JSON.stringify(avatarChoice.parts || {}))
      // Publish the spawn pose immediately, including for automatic returning-player entry.
      game.network.updatePlayer(
        game.myPlayer.x,
        game.myPlayer.y,
        game.myPlayer.anims.currentAnim?.key ?? DEFAULT_AVATAR_CHOICE.avatar + '_idle_down'
      )
      const previewStream = takePreviewMediaStream()
      if (previewStream && game.network.webRTC) await game.network.webRTC.adoptPrejoinMedia(previewStream)
      else previewStream?.getTracks().forEach((track) => track.stop())
      game.network.readyToConnect()
      sessionStorage.removeItem('skyoffice.pendingPlayerName')
      dispatch(setLoggedIn(true))
    } catch (error) {
      joiningRef.current = false
      setJoining(false)
      setEntryError(error instanceof Error ? error.message : 'Não foi possível entrar. Tente novamente.')
    }
  }, [name, roomJoined, avatarLoading, avatarChoice, hasSavedAvatar, dispatch])

  useEffect(() => {
    if (hasSavedAvatar && !avatarLoading && roomJoined) void enterOffice()
  }, [hasSavedAvatar, avatarLoading, roomJoined, enterOffice])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void enterOffice()
  }

  // Returning players never see the creation screen, even while the profile
  // lookup or the room connection is still pending.
  if (avatarLoading || hasSavedAvatar) {
    return (
      <Wrapper onSubmit={handleSubmit}>
        <h2>Bem-vindo de volta, {name}</h2>
        <p role="status">{entryError || (avatarLoading ? 'Carregando seu avatar…' : 'Entrando no escritório…')}</p>
        {entryError && <Button type="submit" variant="contained" disabled={!roomJoined || joining}>Tentar novamente</Button>}
      </Wrapper>
    )
  }

  return (
    <Wrapper onSubmit={handleSubmit}>
      <h2>Bem-vindo ao Escritório dos Estudos</h2>
      <h3>Escolha seu personagem</h3>
      <AvatarPicker value={avatarChoice} onChange={setAvatarChoice} playerName={name} />
      {entryError && <p role="alert">{entryError}</p>}
      <Button variant="contained" color="secondary" size="large" type="submit" disabled={!name || !roomJoined || joining}>
        {joining ? 'Entrando…' : 'Entrar'}
      </Button>
    </Wrapper>
  )
}
