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

export const directConversationKey = (name: string) => name.normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()

const readMarkerKey = (conversationId: string) => `skyoffice.chat.lastRead.${conversationId}`
const readIdsKey = (conversationId: string) => `skyoffice.chat.readMessageIds.${conversationId}`
const loadReadMarker = (conversationId: string) => {
  try { return Number(window.localStorage.getItem(readMarkerKey(conversationId))) || 0 }
  catch { return 0 }
}
const loadReadMessageIds = (conversationId: string) => {
  try {
    const value = window.localStorage.getItem(readIdsKey(conversationId))
    const ids: unknown = value ? JSON.parse(value) : []
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
  } catch { return [] as string[] }
}

export const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    focused: false,
    showChat: false,
    selectedConversation: 'general',
    messages: [] as ConversationMessage[],
    unreadByConversation: {} as Record<string, number>,
    lastReadAtByConversation: {} as Record<string, number>,
    readMessageIdsByConversation: {} as Record<string, string[]>,
    countedUnreadMessageIdsByConversation: {} as Record<string, string[]>,
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
      if (!state.messages.some((message) => message.id === action.payload.id)) {
        state.messages.push(action.payload)
      }
    },
    incrementUnread: (state, action: PayloadAction<{ conversationId: string; sentAt: number; messageId: string }>) => {
      const { conversationId, sentAt, messageId } = action.payload
      const lastReadAt = state.lastReadAtByConversation[conversationId] ?? loadReadMarker(conversationId)
      state.lastReadAtByConversation[conversationId] = lastReadAt
      const readIds = state.readMessageIdsByConversation[conversationId] ?? loadReadMessageIds(conversationId)
      state.readMessageIdsByConversation[conversationId] = readIds
      const unreadIds = state.countedUnreadMessageIdsByConversation[conversationId] ?? []
      state.countedUnreadMessageIdsByConversation[conversationId] = unreadIds
      if (sentAt <= lastReadAt || readIds.includes(messageId) || unreadIds.includes(messageId)) return
      state.countedUnreadMessageIdsByConversation[conversationId] = [...unreadIds, messageId]
      state.unreadByConversation[conversationId] = (state.unreadByConversation[conversationId] || 0) + 1
    },
    markConversationRead: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload
      delete state.unreadByConversation[conversationId]
      // Acknowledge everything currently delivered, including history that may
      // still be replayed after a reconnect or a full page reload.
      const lastReadAt = Math.max(Date.now(), ...state.messages
        .filter((message) => message.conversationId === conversationId)
        .map((message) => message.sentAt))
      state.lastReadAtByConversation[conversationId] = lastReadAt
      try { window.localStorage.setItem(readMarkerKey(conversationId), String(lastReadAt)) }
      catch { /* Keep read state for this page even when storage is unavailable. */ }
      const readIds = state.readMessageIdsByConversation[conversationId] ?? loadReadMessageIds(conversationId)
      const conversationMessageIds = state.messages
        .filter((message) => message.conversationId === conversationId)
        .map((message) => message.id)
      const mergedReadIds = [...new Set([...readIds, ...conversationMessageIds])].slice(-5000)
      state.readMessageIdsByConversation[conversationId] = mergedReadIds
      state.countedUnreadMessageIdsByConversation[conversationId] = []
      try { window.localStorage.setItem(readIdsKey(conversationId), JSON.stringify(mergedReadIds)) }
      catch { /* Keep read state for this page even when storage is unavailable. */ }
    },
    clearDailyChat: (state) => {
      state.messages = []
      state.unreadByConversation = {}
      state.readMessageIdsByConversation = {}
      state.countedUnreadMessageIdsByConversation = {}
      state.lastReadAtByConversation = {}
      try {
        for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
          const key = window.localStorage.key(index)
          if (key?.startsWith('skyoffice.chat.lastRead.') || key?.startsWith('skyoffice.chat.readMessageIds.')) {
            window.localStorage.removeItem(key)
          }
        }
      } catch { /* The in-memory chat is still cleared if storage is unavailable. */ }
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
