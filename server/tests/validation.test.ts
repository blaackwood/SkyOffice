import * as assert from 'assert'
import { selectNearestAvailableMeetingRoom, MeetingRoomCandidate } from '../rooms/MeetingRoomSelection'
import { brasiliaChatClearCycleKey, brasiliaDayKey, millisecondsUntilBrasiliaChatClear, shouldClearDailyChat } from '../../types/DailyChatSchedule'

const rooms: MeetingRoomCandidate[] = [
  { roomId: 'near', roomName: 'Near', x: 10, y: 10, left: 8, top: 8, right: 12, bottom: 12 },
  { roomId: 'middle', roomName: 'Middle', x: 20, y: 10, left: 18, top: 8, right: 22, bottom: 12 },
  { roomId: 'far', roomName: 'Far', x: 30, y: 10, left: 28, top: 8, right: 32, bottom: 12 },
]

const nearestFree = selectNearestAvailableMeetingRoom(
  rooms,
  [
    { playerId: 'caller', x: 0, y: 0 },
    { playerId: 'target', x: 1, y: 0 },
    { playerId: 'other', x: 10, y: 10 },
  ],
  'caller', 'target', 10, 10,
  (roomId) => roomId === 'far',
  new Set(),
)
assert.strictEqual(nearestFree?.roomId, 'middle', 'selects the nearest room that is neither occupied, locked, nor reserved')

const unavailable = selectNearestAvailableMeetingRoom(
  rooms,
  [{ playerId: 'other', x: 20, y: 10 }],
  'caller', 'target', 10, 10,
  () => true,
  new Set(),
)
assert.strictEqual(unavailable, undefined, 'does not return a room when every room is locked')

const beforeClear = new Date('2026-09-24T23:54:59-03:00').getTime()
const atClear = new Date('2026-09-24T23:55:00-03:00').getTime()
assert.strictEqual(millisecondsUntilBrasiliaChatClear(beforeClear), 1000, 'schedules the clear at 23:55 Brasilia time')
assert.strictEqual(brasiliaDayKey(atClear), '2026-09-24')
assert.strictEqual(shouldClearDailyChat(atClear, '2026-09-23'), true, 'clears messages when the scheduled day has not yet been cleared')
assert.strictEqual(shouldClearDailyChat(atClear, '2026-09-24'), false, 'does not clear twice on the same day')
const afterMidnight = new Date('2026-09-25T00:05:00-03:00').getTime()
assert.strictEqual(brasiliaChatClearCycleKey(afterMidnight), '2026-09-24', 'keeps the same daily cleanup cycle across midnight')
assert.strictEqual(shouldClearDailyChat(afterMidnight, '2026-09-24'), false, 'does not erase messages again at midnight')
assert.strictEqual(
  millisecondsUntilBrasiliaChatClear(new Date('2026-09-24T23:55:01-03:00').getTime()),
  24 * 60 * 60 * 1000 - 1000,
  'schedules the next clear for the following day after 23:55',
)

console.log('Validation passed: meeting room selection and daily chat clearing.')
