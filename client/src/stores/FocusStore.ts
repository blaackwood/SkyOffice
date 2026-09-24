import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { FocusPhase, FocusStatus } from '../../../types/IOfficeState'

export interface GroupFocusSnapshot {
  phase: FocusPhase
  status: FocusStatus
  durationSeconds: number
  remainingSeconds: number
}

const initialFocus: GroupFocusSnapshot = {
  phase: 'focus',
  status: 'idle',
  durationSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
}

const focusSlice = createSlice({
  name: 'focus',
  initialState: { group: initialFocus },
  reducers: {
    setGroupFocus: (state, action: PayloadAction<GroupFocusSnapshot>) => {
      state.group = action.payload
    },
  },
})

export const { setGroupFocus } = focusSlice.actions
export default focusSlice.reducer
