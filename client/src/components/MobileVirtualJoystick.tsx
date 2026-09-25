import { useEffect, useState } from 'react'
import styled from 'styled-components'
import JoystickItem from './Joystick'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

import { useAppSelector } from '../hooks'
import { JoystickMovement } from './Joystick'

const Backdrop = styled.div`
  position: fixed;
  left: 12px;
  bottom: calc(76px + env(safe-area-inset-bottom));
  z-index: 35;
  width: 100px;
  height: 100px;
  pointer-events: none !important;
  touch-action: none;
`

const Wrapper = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  pointer-events: none;
`

const JoystickWrapper = styled.div`
  margin-top: auto;
  align-self: flex-start;
  pointer-events: auto;
  touch-action: none;
`
export const minimumScreenWidthSize = 650 //px

const isSmallScreen = (smallScreenSize: number) => {
  const [width, setWidth] = useState(window.innerWidth)

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return width <= smallScreenSize
}

const isTouchDevice = () => typeof window !== 'undefined' && (
  window.matchMedia('(pointer: coarse)').matches || window.navigator.maxTouchPoints > 0
)

export default function MobileVirtualJoystick() {
  const showJoystick = useAppSelector((state) => state.user.showJoystick)
  const showChat = useAppSelector((state) => state.chat.showChat)
  const hasSmallScreen = isSmallScreen(minimumScreenWidthSize)
  const hasTouchInput = isTouchDevice()
  const game = phaserGame.scene.keys.game as Game

  const handleMovement = (movement: JoystickMovement) => {
    game.myPlayer?.handleJoystickMovement(movement)
  }

  return (
    hasSmallScreen && hasTouchInput ? <Backdrop>
      <Wrapper>
        {!(showChat && hasSmallScreen) && showJoystick && (
          <JoystickWrapper>
            <JoystickItem onDirectionChange={handleMovement}></JoystickItem>
          </JoystickWrapper>
        )}
      </Wrapper>
    </Backdrop> : null
  )
}
