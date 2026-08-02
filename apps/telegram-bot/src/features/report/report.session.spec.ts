import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceReportStep,
  createReportSession,
  currentField,
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
      dailySections: [
        field('rating', 'Оценка', 'rating'),
        field('priorities', 'Приоритеты', 'list', 'status'),
        field('conclusion', 'Вывод', 'text'),
      ],
      weeklySections: [field('wins', 'Победы', 'list', 'numbered')],
    },
  );

  setReportType(session, 'daily');
  assert.equal(currentField(session)?.id, 'rating');
  assert.deepEqual(reportStepPosition(session), { current: 1, total: 3 });

  assert.equal(advanceReportStep(session), true);
  assert.equal(currentField(session)?.id, 'priorities');
  assert.equal(advanceReportStep(session), true);
  assert.equal(currentField(session)?.id, 'conclusion');
  assert.equal(advanceReportStep(session), false);

  retreatReportStep(session);
  assert.equal(currentField(session)?.id, 'priorities');
  retreatReportStep(session);
  assert.equal(currentField(session)?.id, 'rating');
  retreatReportStep(session);
  assert.equal(currentField(session), null);
  assert.equal(session.type, null);
});

function field(
  id: string,
  title: string,
  inputType: 'text' | 'list' | 'rating' | 'boolean',
  listStyle: 'dash' | 'numbered' | 'status' | null = null,
) {
  return { id, title, prompt: '', inputType, listStyle, required: true };
}
