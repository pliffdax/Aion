import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceReportStep,
  createReportSession,
  currentField,
  currentTypeAnswers,
  editExistingReport,
  refillExistingReport,
  reportStepPosition,
  retreatReportStep,
  selectExistingReport,
  setReportType,
  shouldKeepReportCollector,
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

test('keeps the collector only while another report delivery claim is active', () => {
  assert.equal(shouldKeepReportCollector('busy'), true);
  assert.equal(shouldKeepReportCollector('claimed'), false);
  assert.equal(shouldKeepReportCollector('already_sent'), false);
});

test('loads saved answers for editing and clears them for refill', () => {
  const session = createReportSession(
    1,
    'Test User',
    '#TestUser',
    '2026-07-19',
    { chatId: 1, messageId: 1 },
    { date: '2026-08-03', week: 3, day: 3 },
    {
      dailySections: [field('current', 'Текущая структура', 'text')],
      weeklySections: [],
    },
  );
  const report = {
    id: 'report-1',
    telegramUserId: '1',
    type: 'daily' as const,
    periodStart: '2026-08-03',
    periodEnd: '2026-08-03',
    text: 'Saved report',
    createdAt: '2026-08-03T20:00:00.000Z',
    sentAt: '2026-08-03T20:00:01.000Z',
    answers: {
      saved: {
        text: '',
        items: [{ id: 7, text: 'Готово', status: 'completed' as const }],
        rating: null,
        boolean: null,
      },
    },
    configuration: [field('saved', 'Сохранённая структура', 'list', 'status')],
    revision: 1,
    telegramMessageId: '77',
  };

  selectExistingReport(session, 'daily', report);
  assert.equal(editExistingReport(session), true);
  assert.equal(session.replaceMode, 'edit');
  assert.equal(currentField(session)?.id, 'saved');
  assert.deepEqual(currentTypeAnswers(session), report.answers);
  assert.equal(session.nextItemId, 8);

  currentTypeAnswers(session).saved!.items[0]!.text = 'Изменено локально';
  assert.equal(report.answers.saved.items[0]?.text, 'Готово');

  selectExistingReport(session, 'daily', report);
  assert.equal(refillExistingReport(session), true);
  assert.equal(session.replaceMode, 'refill');
  assert.deepEqual(currentTypeAnswers(session), {
    saved: { text: '', items: [], rating: null, boolean: null },
  });
});

test('legacy report can be refilled but not reconstructed for field editing', () => {
  const session = createReportSession(
    1,
    'Test User',
    '#TestUser',
    '2026-07-19',
    { chatId: 1, messageId: 1 },
    { date: '2026-08-03', week: 3, day: 3 },
    { dailySections: [field('summary', 'Итог', 'text')], weeklySections: [] },
  );
  const legacy = {
    id: 'report-legacy',
    telegramUserId: '1',
    type: 'daily' as const,
    periodStart: '2026-08-03',
    periodEnd: '2026-08-03',
    text: 'Legacy report',
    createdAt: '2026-08-03T20:00:00.000Z',
    sentAt: '2026-08-03T20:00:01.000Z',
    answers: null,
    configuration: null,
    revision: 1,
    telegramMessageId: '77',
  };

  selectExistingReport(session, 'daily', legacy);
  assert.equal(editExistingReport(session), false);
  assert.equal(refillExistingReport(session), true);
});

function field(
  id: string,
  title: string,
  inputType: 'text' | 'list' | 'rating' | 'boolean',
  listStyle: 'dash' | 'numbered' | 'status' | null = null,
) {
  return { id, title, prompt: '', inputType, listStyle, required: true };
}
