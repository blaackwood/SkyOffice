import React, { useState } from 'react'
import styled from 'styled-components'
import Button from '@mui/material/Button'
import AvatarPicker from './AvatarPicker'
import { AvatarChoice, DEFAULT_AVATAR_CHOICE, loadSavedAvatar, saveAvatar } from '../avatarConfig'
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
  const [name] = useState<string>(() => formatStudyName(sessionStorage.getItem('skyoffice.pendingPlayerName') || ''))
  const [avatarChoice, setAvatarChoice] = useState<AvatarChoice>(
    () => loadSavedAvatar(name) || DEFAULT_AVATAR_CHOICE
  )
  const dispatch = useAppDispatch()
  const roomJoined = useAppSelector((state) => state.room.roomJoined)
  const game = phaserGame.scene.keys.game as Game

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name || !roomJoined) return
    primeChatNotificationSound()
    saveAvatar(name, avatarChoice)
    sessionStorage.removeItem('skyoffice.pendingPlayerName')
    game.registerKeys()
    game.myPlayer.setPlayerName(name)
    dispatch(setMyPlayerName(name))
    game.myPlayer.setPlayerTexture(avatarChoice.avatar)
    game.myPlayer.setPlayerTint(avatarChoice.tint)
    // Publish the spawn position as soon as the player joins. Otherwise a
    // late joiner can receive the schema's default coordinates for this player
    // until they move for the first time.
    game.network.updatePlayer(
      game.myPlayer.x,
      game.myPlayer.y,
      game.myPlayer.anims.currentAnim?.key ?? `${avatarChoice.avatar}_idle_down`
    )
    const previewStream = takePreviewMediaStream()
    if (previewStream && game.network.webRTC) game.network.webRTC.adoptPrejoinMedia(previewStream)
    else previewStream?.getTracks().forEach((track) => track.stop())
    game.network.readyToConnect()
    dispatch(setLoggedIn(true))
  }

  return (
    <Wrapper onSubmit={handleSubmit}>
      <h2>Bem-vindo ao Escritório dos Estudos</h2>
      <h3>Escolha seu personagem</h3>
      <AvatarPicker value={avatarChoice} onChange={setAvatarChoice} />
      <Button variant="contained" color="secondary" size="large" type="submit" disabled={!name || !roomJoined}>
        Entrar
      </Button>
    </Wrapper>
  )
}
