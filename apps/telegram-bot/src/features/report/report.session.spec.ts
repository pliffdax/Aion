import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceReportStep,
  createReportSession,
  reportStepPosition,
  retreatReportStep,
  setReportType,
} from './report.session.js';

test('walks only through enabled sections in their configured order', () => {
  const session = createReportSession(
    1,
    'Test User',
    '#TestUser',
    '2026-07-19',
    { chatId: 1, messageId: 1 },
    { date: '2026-08-02', week: 3, day: 2 },
    {
      dailySections: ['daily-rating', 'daily-priorities', 'daily-conclusion'],
      weeklySections: ['weekly-wins'],
    },
  );

  setReportType(session, 'daily');
  assert.equal(session.step, 'daily-rating');
  assert.deepEqual(reportStepPosition(session), { current: 1, total: 3 });

  assert.equal(advanceReportStep(session), true);
  assert.equal(session.step, 'daily-priorities');
  assert.equal(advanceReportStep(session), true);
  assert.equal(session.step, 'daily-conclusion');
  assert.equal(advanceReportStep(session), false);

  retreatReportStep(session);
  assert.equal(session.step, 'daily-priorities');
  retreatReportStep(session);
  assert.equal(session.step, 'daily-rating');
  retreatReportStep(session);
  assert.equal(session.step, 'choose');
  assert.equal(session.type, null);
});
