import assert from 'node:assert/strict';
import test from 'node:test';
import type { v1 } from '@aion/contracts';
import { formatDailyReport } from './report.formatter.js';

test('formats configured fields in order using every supported field type', () => {
  const fields: v1.TelegramReportField[] = [
    field('rating', 'Счастье', 'rating'),
    field('priorities', 'Приоритет дня', 'list', 'status'),
    field('tomorrow', 'Завтра', 'list', 'numbered'),
    field('optional', 'Не заполнено', 'text', null, false),
    field('conclusion', 'Вывод дня', 'text'),
    field('review', 'Прошу на разбор', 'boolean'),
  ];
  const report = formatDailyReport(
    {
      priorities: answer({
        items: [{ id: 1, text: 'Закрыть задачу', status: 'completed' }],
      }),
      conclusion: answer({ text: 'Полезный день' }),
      tomorrow: answer({ items: [{ id: 2, text: 'Позвонить', status: 'pending' }] }),
      rating: answer({ rating: 8 }),
      review: answer({ boolean: false }),
    },
    { date: '2026-08-02', week: 3, day: 2 },
    '#TestUser',
    fields,
  );

  assert.ok(report.indexOf('Счастье: 8/10') < report.indexOf('Приоритет дня'));
  assert.match(report, /– Закрыть задачу ✅/);
  assert.match(report, /1\. Позвонить/);
  assert.match(report, /Вывод дня:<\/b>\nПолезный день/);
  assert.match(report, /Прошу на разбор:<\/b>\nНет\./);
  assert.doesNotMatch(report, /Не заполнено/);
});

function field(
  id: string,
  title: string,
  inputType: v1.TelegramReportFieldInputType,
  listStyle: v1.TelegramReportListStyle | null = null,
  required = true,
): v1.TelegramReportField {
  return { id, title, prompt: '', inputType, listStyle, required };
}

function answer(
  overrides: Partial<{
    text: string;
    items: { id: number; text: string; status: 'pending' | 'completed' | 'failed' }[];
    rating: number | null;
    boolean: boolean | null;
  }> = {},
) {
  return { text: '', items: [], rating: null, boolean: null, ...overrides };
}
