import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

export type ChatChannel = 'general' | 'direct'
export type ChatAttachment = { name: string; mimeType: string; data: string }

export type ConversationMessage = {
  id: string
  channel: ChatChannel
  conversationId: string
  senderId: string
  senderName: string
  recipientId?: string
  recipientName?: string
  content: string
  attachment?: ChatAttachment
  sentAt: number
}

export const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    focused: false,
    showChat: false,
    selectedConversation: 'general',
    messages: [] as ConversationMessage[],
    unreadByConversation: {} as Record<string, number>,
  },
  reducers: {
    setFocused: (state, action: PayloadAction<boolean>) => {
      const game = phaserGame.scene.keys.game as Game | undefined
      if (game) action.payload ? game.disableKeys() : game.enableKeys()
      state.focused = action.payload
    },
    setShowChat: (state, action: PayloadAction<boolean>) => {
      state.showChat = action.payload
    },
    setSelectedConversation: (state, action: PayloadAction<string>) => {
      state.selectedConversation = action.payload
    },
    pushConversationMessage: (state, action: PayloadAction<ConversationMessage>) => {
      state.messages.push(action.payload)
    },
    incrementUnread: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload
      state.unreadByConversation[conversationId] = (state.unreadByConversation[conversationId] || 0) + 1
    },
    markConversationRead: (state, action: PayloadAction<string>) => {
      delete state.unreadByConversation[action.payload]
    },
    clearDailyChat: (state) => {
      state.messages = []
      state.unreadByConversation = {}
    },
  },
})

export const {
  setFocused,
  setShowChat,
  setSelectedConversation,
  pushConversationMessage,
  incrementUnread,
  markConversationRead,
  clearDailyChat,
} = chatSlice.actions
export default chatSlice.reducer
