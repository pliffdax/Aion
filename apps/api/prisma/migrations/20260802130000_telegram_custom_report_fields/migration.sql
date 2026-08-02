ALTER TABLE "TelegramUser"
RENAME COLUMN "reportDailySections" TO "reportDailySectionIdsLegacy";

ALTER TABLE "TelegramUser"
RENAME COLUMN "reportWeeklySections" TO "reportWeeklySectionIdsLegacy";

ALTER TABLE "TelegramUser"
ADD COLUMN "reportDailySections" JSONB NOT NULL DEFAULT '[
  {"id":"daily-priorities","title":"Приоритет дня","prompt":"Добавьте приоритеты дня и отметьте их статус.","inputType":"list","listStyle":"status","required":true},
  {"id":"daily-event","title":"Событие дня","prompt":"Опишите главное событие дня.","inputType":"text","listStyle":null,"required":true},
  {"id":"daily-conclusion","title":"Вывод дня","prompt":"Напишите основной вывод дня.","inputType":"text","listStyle":null,"required":true},
  {"id":"daily-tomorrow","title":"Главные задачи на завтра","prompt":"Добавьте задачи на следующий день.","inputType":"list","listStyle":"dash","required":true},
  {"id":"daily-rating","title":"Счастье","prompt":"Оцените день от 1 до 10.","inputType":"rating","listStyle":null,"required":true}
]'::JSONB,
ADD COLUMN "reportWeeklySections" JSONB NOT NULL DEFAULT '[
  {"id":"weekly-wins","title":"Победы недели","prompt":"Перечислите победы недели.","inputType":"list","listStyle":"numbered","required":true},
  {"id":"weekly-failure","title":"Провал недели","prompt":"Опишите главный провал недели.","inputType":"text","listStyle":null,"required":true},
  {"id":"weekly-insight","title":"Инсайт недели","prompt":"Запишите главный инсайт недели.","inputType":"text","listStyle":null,"required":true},
  {"id":"weekly-next","title":"План на следующую неделю","prompt":"Перечислите задачи следующей недели.","inputType":"list","listStyle":"numbered","required":true},
  {"id":"weekly-review","title":"Прошу на разбор","prompt":"Нужно ли разобрать этот отчёт?","inputType":"boolean","listStyle":null,"required":true}
]'::JSONB;

UPDATE "TelegramUser" AS users
SET "reportDailySections" = COALESCE(
  (
    SELECT jsonb_agg(
      CASE section_id
        WHEN 'daily-priorities' THEN '{"id":"daily-priorities","title":"Приоритет дня","prompt":"Добавьте приоритеты дня и отметьте их статус.","inputType":"list","listStyle":"status","required":true}'::JSONB
        WHEN 'daily-event' THEN '{"id":"daily-event","title":"Событие дня","prompt":"Опишите главное событие дня.","inputType":"text","listStyle":null,"required":true}'::JSONB
        WHEN 'daily-conclusion' THEN '{"id":"daily-conclusion","title":"Вывод дня","prompt":"Напишите основной вывод дня.","inputType":"text","listStyle":null,"required":true}'::JSONB
        WHEN 'daily-tomorrow' THEN '{"id":"daily-tomorrow","title":"Главные задачи на завтра","prompt":"Добавьте задачи на следующий день.","inputType":"list","listStyle":"dash","required":true}'::JSONB
        WHEN 'daily-rating' THEN '{"id":"daily-rating","title":"Счастье","prompt":"Оцените день от 1 до 10.","inputType":"rating","listStyle":null,"required":true}'::JSONB
      END ORDER BY section_order
    )
    FROM unnest(users."reportDailySectionIdsLegacy") WITH ORDINALITY AS sections(section_id, section_order)
  ),
  users."reportDailySections"
),
"reportWeeklySections" = COALESCE(
  (
    SELECT jsonb_agg(
      CASE section_id
        WHEN 'weekly-wins' THEN '{"id":"weekly-wins","title":"Победы недели","prompt":"Перечислите победы недели.","inputType":"list","listStyle":"numbered","required":true}'::JSONB
        WHEN 'weekly-failure' THEN '{"id":"weekly-failure","title":"Провал недели","prompt":"Опишите главный провал недели.","inputType":"text","listStyle":null,"required":true}'::JSONB
        WHEN 'weekly-insight' THEN '{"id":"weekly-insight","title":"Инсайт недели","prompt":"Запишите главный инсайт недели.","inputType":"text","listStyle":null,"required":true}'::JSONB
        WHEN 'weekly-next' THEN '{"id":"weekly-next","title":"План на следующую неделю","prompt":"Перечислите задачи следующей недели.","inputType":"list","listStyle":"numbered","required":true}'::JSONB
        WHEN 'weekly-review' THEN '{"id":"weekly-review","title":"Прошу на разбор","prompt":"Нужно ли разобрать этот отчёт?","inputType":"boolean","listStyle":null,"required":true}'::JSONB
      END ORDER BY section_order
    )
    FROM unnest(users."reportWeeklySectionIdsLegacy") WITH ORDINALITY AS sections(section_id, section_order)
  ),
  users."reportWeeklySections"
);
