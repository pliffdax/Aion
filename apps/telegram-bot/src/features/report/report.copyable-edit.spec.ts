import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createReportSession,
  currentTypeAnswers,
  setReportType,
  type ReportField,
} from './report.session.js';
import {
  buildCollectorKeyboard,
  buildReportFieldTextInputKeyboard,
  renderCollector,
  renderReportFieldTextPrompt,
} from './report.view.js';

test('renders an edited report item as copyable text with a native copy button', () => {
  const session = reportSession(field('items', 'Пункты', 'list'));
  setReportType(session, 'daily');
  currentTypeAnswers(session).items!.items.push({
    id: 1,
    text: 'Исправить <формат>',
    status: 'pending',
  });
  session.editingItemId = 1;

  assert.match(renderCollector(session), /<pre>Исправить &lt;формат&gt;<\/pre>/);
  assert.deepEqual(copyValues(buildCollectorKeyboard(session)), ['Исправить <формат>']);
});

test('keeps long report text copyable without an unsupported native copy button', () => {
  const session = reportSession(field('summary', 'Итог', 'text'));
  setReportType(session, 'daily');
  const longText = 'Д'.repeat(300);
  currentTypeAnswers(session).summary!.text = longText;

  assert.match(renderCollector(session), new RegExp(`<pre>${longText}</pre>`));
  assert.deepEqual(copyValues(buildCollectorKeyboard(session)), []);
});

test('shows the previous report field value while renaming it', () => {
  const reportField = field('summary', 'Старое название', 'text');

  assert.match(
    renderReportFieldTextPrompt('ru', reportField, 'title'),
    /<pre>Старое название<\/pre>/,
  );
  assert.deepEqual(copyValues(buildReportFieldTextInputKeyboard('ru', reportField.title)), [
    'Старое название',
  ]);
});

function reportSession(reportField: ReportField) {
  return createReportSession(
    123,
    'Test User',
    '#TestUser',
    '2026-08-01',
    { chatId: 123, messageId: 1 },
    { date: '2026-08-05', week: 1, day: 5 },
    { dailySections: [reportField], weeklySections: [] },
  );
}

function field(id: string, title: string, inputType: 'text' | 'list'): ReportField {
  return { id, title, prompt: '', inputType, listStyle: null, required: true };
}

function copyValues(keyboard: ReturnType<typeof buildCollectorKeyboard>): string[] {
  return keyboard.inline_keyboard
    .flat()
    .flatMap(button => ('copy_text' in button ? [button.copy_text.text] : []));
}
