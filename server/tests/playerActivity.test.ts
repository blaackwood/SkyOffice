import * as assert from 'assert'
import { activityElapsed, changeActivity } from '../../types/PlayerActivity'

const empty = { label: '', startedAt: 0, elapsedMs: 0 }
const started = changeActivity(empty, { action: 'start', label: ' Fazendo simulado ' }, 1000)
assert.strictEqual(started.label, 'Fazendo simulado')
assert.strictEqual(activityElapsed(started, 61000), 60000)
const paused = changeActivity(started, { action: 'pause' }, 61000)
assert.strictEqual(activityElapsed(paused, 121000), 60000, 'paused time must not increase')
assert.strictEqual(changeActivity(paused, { action: 'pause' }, 121000), paused)
const resumed = changeActivity(paused, { action: 'resume' }, 121000)
assert.strictEqual(activityElapsed(resumed, 181000), 120000, 'resuming must exclude the pause')
assert.strictEqual(changeActivity(resumed, { action: 'resume' }, 181000), resumed)
assert.deepStrictEqual(changeActivity(resumed, { action: 'stop' }, 181000), empty)
assert.strictEqual(changeActivity(empty, { action: 'start', label: '  ' }, 1000), empty)
assert.strictEqual(changeActivity(empty, null, 1000), empty)
assert.strictEqual(changeActivity(empty, { action: 'start', label: 42 }, 1000), empty)
assert.strictEqual(changeActivity(empty, { action: 'resume' }, 1000), empty)
assert.strictEqual(changeActivity(empty, { action: 'start', label: 'a'.repeat(100) }, 1000).label.length, 48)
assert.strictEqual(changeActivity(empty, { action: 'start', label: 'Revisando\nmatemática', startedAt: 999999 }, 1000).startedAt, 1000, 'the server owns the clock')
console.log('Activity timer tests passed')
const subject = changeActivity(started, { action: 'subject', label: ' Matemática ' }, 999000)
assert.deepStrictEqual(subject, { label: 'Matemática', startedAt: 0, elapsedMs: 0 }, 'a subject must not start a second study timer')
assert.deepStrictEqual(changeActivity(subject, { action: 'subject', label: '' }, 999000), empty, 'the subject can be cleared independently')
