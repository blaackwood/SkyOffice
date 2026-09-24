import React from 'react'
import styled from 'styled-components'
import Tooltip from '@mui/material/Tooltip'
import CheckIcon from '@mui/icons-material/Check'

import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation } from 'swiper'
import 'swiper/css'
import 'swiper/css/navigation'

import { AVATAR_BASES, AVATAR_TINTS, AvatarChoice } from '../avatarConfig'

const Wrapper = styled.div`
  --swiper-navigation-size: 22px;

  .swiper {
    width: 160px;
    height: 220px;
    border-radius: 8px;
    overflow: hidden;
  }

  .swiper-slide {
    width: 160px;
    height: 220px;
    background: #dbdbe0;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .swiper-slide img {
    display: block;
    width: 95px;
    height: 136px;
    object-fit: contain;
  }
`

const TintRow = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 14px;
  justify-content: center;
`

const Swatch = styled.button<{ bg: string; selected: boolean }>`
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid ${(props) => (props.selected ? '#05bdba' : 'transparent')};
  background: ${(props) => props.bg};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;

  svg {
    font-size: 14px;
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.6));
  }

  &:hover {
    filter: brightness(1.1);
  }
`

type Props = {
  value: AvatarChoice
  onChange: (value: AvatarChoice) => void
}

export default function AvatarPicker({ value, onChange }: Props) {
  const avatarIndex = Math.max(
    0,
    AVATAR_BASES.findIndex((a) => a.name === value.avatar)
  )

  return (
    <Wrapper>
      <Swiper
        modules={[Navigation]}
        navigation
        spaceBetween={0}
        slidesPerView={1}
        initialSlide={avatarIndex}
        onSlideChange={(swiper) => {
          onChange({ ...value, avatar: AVATAR_BASES[swiper.activeIndex].name })
        }}
      >
        {AVATAR_BASES.map((avatar) => (
          <SwiperSlide key={avatar.name}>
            <img src={avatar.img} alt={avatar.name} />
          </SwiperSlide>
        ))}
      </Swiper>
      <TintRow>
        {AVATAR_TINTS.map((tint) => (
          <Tooltip title={tint.name} key={tint.name}>
            <Swatch
              bg={`#${tint.value.toString(16).padStart(6, '0')}`}
              selected={value.tint === tint.value}
              onClick={() => onChange({ ...value, tint: tint.value })}
              type="button"
            >
              {value.tint === tint.value && <CheckIcon fontSize="inherit" />}
            </Swatch>
          </Tooltip>
        ))}
      </TintRow>
    </Wrapper>
  )
}