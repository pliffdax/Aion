// fallow-ignore-file code-duplication
// Translation rows intentionally repeat the same [ru, uk, en] data shape.
const supportedLocales = ['ru', 'uk', 'en'] as const;

export type Locale = (typeof supportedLocales)[number];

const defaultLocale: Locale = 'ru';
const localesByUserId = new Map<number, Locale>();
const localeIndexes: Record<Locale, 0 | 1 | 2> = { ru: 0, uk: 1, en: 2 };

const translations = {
  'access.closed': [
    'Доступ к боту пока закрыт.',
    'Доступ до бота поки закритий.',
    'Access to the bot is currently closed.',
  ],
  'access.contactAdmin': [
    'Чтобы получить доступ, свяжитесь с администратором: @Pliffdax',
    'Щоб отримати доступ, зверніться до адміністратора: @Pliffdax',
    'To request access, contact the administrator: @Pliffdax',
  ],
  'access.ownerOnly': [
    'Эта команда доступна только владельцу бота.',
    'Ця команда доступна лише власнику бота.',
    'This command is available only to the bot owner.',
  ],
  'error.temporary': [
    'Не удалось выполнить действие. Попробуйте ещё раз чуть позже.',
    'Не вдалося виконати дію. Спробуйте ще раз трохи пізніше.',
    'The action could not be completed. Please try again shortly.',
  ],
  'commands.helpTitle': ['Доступные команды:', 'Доступні команди:', 'Available commands:'],
  'command.start.description': ['Запустить бота', 'Запустити бота', 'Start the bot'],
  'command.help.description': [
    'Показать доступные команды',
    'Показати доступні команди',
    'Show available commands',
  ],
  'command.plan.description': [
    'Открыть ежедневный план',
    'Відкрити щоденний план',
    'Open the daily plan',
  ],
  'command.language.description': ['Изменить язык', 'Змінити мову', 'Change language'],
  'command.ping.description': [
    'Проверить, работает ли бот',
    'Перевірити, чи працює бот',
    'Check whether the bot is running',
  ],
  'command.whoami.description': [
    'Показать Telegram ID',
    'Показати Telegram ID',
    'Show Telegram ID',
  ],
  'command.report.description': [
    'Собрать личный отчёт',
    'Зібрати особистий звіт',
    'Build a personal report',
  ],
  'command.reminder.description': [
    'Создать напоминание',
    'Створити нагадування',
    'Create a reminder',
  ],
  'ping.response': ['pong', 'pong', 'pong'],
  'start.greeting': ['Привет! Aion работает.', 'Привіт! Aion працює.', 'Hi! Aion is running.'],
  'language.prompt': ['Выберите язык:', 'Виберіть мову:', 'Choose a language:'],
  'language.changed': [
    'Язык изменён на русский.',
    'Мову змінено на українську.',
    'Language changed to English.',
  ],
  'language.russian': ['Русский', 'Русский', 'Русский'],
  'language.ukrainian': ['Українська', 'Українська', 'Українська'],
  'language.english': ['English', 'English', 'English'],
  'whoami.prompt': [
    'Чей Telegram user ID показать?',
    'Чий Telegram user ID показати?',
    'Whose Telegram user ID should I show?',
  ],
  'whoami.self': ['Я', 'Я', 'Me'],
  'whoami.other': ['Другой пользователь', 'Інший користувач', 'Another user'],
  'whoami.currentUserId': [
    'Ваш Telegram user ID:',
    'Ваш Telegram user ID:',
    'Your Telegram user ID:',
  ],
  'whoami.chatUnavailable': [
    'Не удалось определить текущий чат.',
    'Не вдалося визначити поточний чат.',
    'Could not determine the current chat.',
  ],
  'whoami.selectOther': [
    'Выберите другого пользователя с помощью кнопки ниже.',
    'Виберіть іншого користувача за допомогою кнопки нижче.',
    'Select another user using the button below.',
  ],
  'whoami.openSelector': [
    'Telegram откроет список пользователей для выбора.',
    'Telegram відкриє список користувачів для вибору.',
    'Telegram will open the user selection screen.',
  ],
  'whoami.selectButton': ['Выбрать пользователя', 'Вибрати користувача', 'Select a user'],
  'whoami.userUnavailable': [
    'Telegram не передал выбранного пользователя.',
    'Telegram не передав вибраного користувача.',
    'Telegram did not provide the selected user.',
  ],
  'whoami.userId': ['Telegram user ID:', 'Telegram user ID:', 'Telegram user ID:'],
  'whoami.username': ['Имя пользователя:', 'Ім’я користувача:', 'Username:'],
  'daily.maxItems': [
    'В плане уже максимум {max} пунктов.',
    'У плані вже максимум {max} пунктів.',
    'The plan already has the maximum of {max} items.',
  ],
  'daily.panelUnavailable': [
    'Не удалось определить сообщение плана. Вызовите /plan ещё раз.',
    'Не вдалося визначити повідомлення плану. Викличте /plan знову.',
    'Could not find the plan message. Run /plan again.',
  ],
  'daily.addPrompt': [
    'Напишите новый пункт плана.',
    'Напишіть новий пункт плану.',
    'Enter a new plan item.',
  ],
  'daily.cancel': ['🚫 Отмена', '🚫 Скасувати', '🚫 Cancel'],
  'daily.cancelled': ['Отменено', 'Скасовано', 'Cancelled'],
  'daily.deletePrompt': ['Удалить пункт?', 'Видалити пункт?', 'Delete this item?'],
  'daily.delete': ['🗑 Удалить', '🗑 Видалити', '🗑 Delete'],
  'daily.editPrompt': [
    'Введите новый текст для пункта:',
    'Введіть новий текст для пункту:',
    'Enter new text for the item:',
  ],
  'daily.itemDeleted': ['Пункт удалён', 'Пункт видалено', 'Item deleted'],
  'daily.itemMissing': [
    'Пункт уже отсутствует',
    'Пункт уже відсутній',
    'The item no longer exists',
  ],
  'daily.deleteCancelled': ['Удаление отменено', 'Видалення скасовано', 'Deletion cancelled'],
  'daily.emptyItem': [
    'Пункт не может быть пустым.',
    'Пункт не може бути порожнім.',
    'The item cannot be empty.',
  ],
  'daily.itemTooLong': [
    'Сократите пункт до {max} символов.',
    'Скоротіть пункт до {max} символів.',
    'Shorten the item to {max} characters.',
  ],
  'daily.title': ['План на сегодня', 'План на сьогодні', "Today's plan"],
  'daily.emptyPlan': ['План пока пуст.', 'План поки порожній.', 'The plan is empty.'],
  'daily.completed': ['выполнено', 'виконано', 'completed'],
  'daily.managementTitle': ['Управление планом', 'Керування планом', 'Plan management'],
  'daily.noItems': [
    'В плане нет пунктов.',
    'У плані немає пунктів.',
    'There are no items in the plan.',
  ],
  'daily.add': ['➕ Добавить', '➕ Додати', '➕ Add'],
  'daily.manage': ['⚙️ Управление', '⚙️ Керування', '⚙️ Manage'],
  'daily.clearCompleted': ['🧹 Убрать выполненные', '🧹 Прибрати виконані', '🧹 Remove completed'],
  'daily.editItem': ['✏️ Редактировать {number}', '✏️ Редагувати {number}', '✏️ Edit {number}'],
  'daily.deleteItem': ['🗑 Удалить {number}', '🗑 Видалити {number}', '🗑 Delete {number}'],
  'daily.done': ['✅ Готово', '✅ Готово', '✅ Done'],
  'daily.summaryTitle': ['Итоги {date}', 'Підсумки {date}', 'Summary for {date}'],
  'daily.summaryProgress': [
    'Выполнено: {completed}/{total}',
    'Виконано: {completed}/{total}',
    'Completed: {completed}/{total}',
  ],
  'daily.summaryCompletedTitle': ['Выполнено:', 'Виконано:', 'Completed:'],
  'daily.summaryNoneCompleted': [
    'Ничего не выполнено.',
    'Нічого не виконано.',
    'Nothing was completed.',
  ],
  'daily.summaryCarriedTitle': [
    'Перенесено на {date}:',
    'Перенесено на {date}:',
    'Carried over to {date}:',
  ],
  'daily.summaryNoneCarried': [
    'Незавершённых задач нет.',
    'Незавершених завдань немає.',
    'There are no unfinished tasks.',
  ],
  'report.chooseType': [
    'Какой отчёт собираем?',
    'Який звіт збираємо?',
    'Which report should we build?',
  ],
  'report.daily': ['Дневной', 'Денний', 'Daily'],
  'report.weekly': ['Недельный', 'Тижневий', 'Weekly'],
  'report.cancel': ['🚫 Отменить отчёт', '🚫 Скасувати звіт', '🚫 Cancel report'],
  'report.cancelled': ['Сбор отчёта отменён.', 'Збір звіту скасовано.', 'Report cancelled.'],
  'report.next': ['⏩️ Дальше', '⏩️ Далі', '⏩️ Next'],
  'report.back': ['⏪️ Назад', '⏪️ Назад', '⏪️ Back'],
  'report.clear': ['Очистить', 'Очистити', 'Clear'],
  'report.needItem': [
    'Добавьте хотя бы один пункт.',
    'Додайте хоча б один пункт.',
    'Add at least one item.',
  ],
  'report.needText': [
    'Сначала напишите текст для этого раздела.',
    'Спочатку напишіть текст для цього розділу.',
    'Enter text for this section first.',
  ],
  'report.maxItems': [
    'В одном разделе может быть не больше {max} пунктов.',
    'В одному розділі може бути не більше {max} пунктів.',
    'A section can contain at most {max} items.',
  ],
  'report.itemTooLong': [
    'Один пункт должен быть не длиннее {max} символов.',
    'Один пункт має бути не довшим за {max} символів.',
    'An item must not exceed {max} characters.',
  ],
  'report.textTooLong': [
    'Текст раздела должен быть не длиннее {max} символов.',
    'Текст розділу має бути не довшим за {max} символів.',
    'Section text must not exceed {max} characters.',
  ],
  'report.tooLong': [
    'Отчёт стал слишком длинным. Сократите текущий текст или пункты.',
    'Звіт став надто довгим. Скоротіть поточний текст або пункти.',
    'The report is too long. Shorten the current text or items.',
  ],
  'report.listHint': [
    'Отправляйте пункты отдельными сообщениями или несколькими строками. Когда закончите — нажмите «Дальше».',
    'Надсилайте пункти окремими повідомленнями або кількома рядками. Коли закінчите — натисніть «Далі».',
    'Send items as separate messages or multiple lines. Press Next when finished.',
  ],
  'report.priorityHint': [
    'Статус пункта переключается кнопкой: ⬜ → ✅ → ❌.',
    'Статус пункту перемикається кнопкою: ⬜ → ✅ → ❌.',
    'Toggle an item status with its button: ⬜ → ✅ → ❌.',
  ],
  'report.textHint': [
    'Отправьте текст раздела. Новое сообщение заменит текущий текст.',
    'Надішліть текст розділу. Нове повідомлення замінить поточний текст.',
    'Send the section text. A new message replaces the current text.',
  ],
  'report.editingItem': [
    'Отправьте новый текст для пункта {number}.',
    'Надішліть новий текст для пункту {number}.',
    'Send new text for item {number}.',
  ],
  'report.editItem': ['✏️ {number}', '✏️ {number}', '✏️ {number}'],
  'report.deleteItem': ['🗑 {number}', '🗑 {number}', '🗑 {number}'],
  'report.dailyPriorities': ['Приоритет дня', 'Пріоритет дня', 'Daily priorities'],
  'report.dailyEvent': ['Событие дня', 'Подія дня', 'Event of the day'],
  'report.dailyConclusion': ['Вывод дня', 'Висновок дня', 'Daily conclusion'],
  'report.dailyTomorrow': [
    'Главные задачи на завтра',
    'Головні завдання на завтра',
    "Tomorrow's main tasks",
  ],
  'report.dailyRating': ['Оценка дня', 'Оцінка дня', 'Daily rating'],
  'report.weeklyWins': ['Победы недели', 'Перемоги тижня', 'Weekly wins'],
  'report.weeklyFailure': ['Провал недели', 'Провал тижня', 'Weekly failure'],
  'report.weeklyInsight': ['Инсайт недели', 'Інсайт тижня', 'Weekly insight'],
  'report.weeklyNextPlan': [
    'План на следующую неделю',
    'План на наступний тиждень',
    'Plan for next week',
  ],
  'report.weeklyReview': ['Прошу на разбор', 'Прошу на розбір', 'Request a review'],
  'report.ratingPrompt': [
    'Выберите оценку дня от 1 до 10.',
    'Оберіть оцінку дня від 1 до 10.',
    'Choose a daily rating from 1 to 10.',
  ],
  'report.reviewPrompt': [
    'Просить отчёт на разбор?',
    'Просити звіт на розбір?',
    'Request a review of this report?',
  ],
  'report.yes': ['Да', 'Так', 'Yes'],
  'report.no': ['Нет', 'Ні', 'No'],
  'report.stale': [
    'Этот конструктор уже неактивен. Вызовите /report заново.',
    'Цей конструктор уже неактивний. Викличте /report знову.',
    'This builder is no longer active. Run /report again.',
  ],
  'reminder.menuTitle': ['Напоминания', 'Нагадування', 'Reminders'],
  'reminder.menuHint': [
    'Активных напоминаний: {count}.',
    'Активних нагадувань: {count}.',
    'Active reminders: {count}.',
  ],
  'reminder.create': ['➕ Создать', '➕ Створити', '➕ Create'],
  'reminder.list': ['📋 Мои напоминания', '📋 Мої нагадування', '📋 My reminders'],
  'reminder.cancel': ['🚫 Отменить', '🚫 Скасувати', '🚫 Cancel'],
  'reminder.cancelled': [
    'Действие с напоминанием отменено.',
    'Дію з нагадуванням скасовано.',
    'Reminder action cancelled.',
  ],
  'reminder.back': ['⬅️ Назад', '⬅️ Назад', '⬅️ Back'],
  'reminder.createTitle': ['Новое напоминание', 'Нове нагадування', 'New reminder'],
  'reminder.textPrompt': [
    'Что нужно напомнить? Отправьте текст одним сообщением.',
    'Про що потрібно нагадати? Надішліть текст одним повідомленням.',
    'What should I remind you about? Send the text in one message.',
  ],
  'reminder.invalidText': [
    'Текст должен содержать от 1 до {max} символов.',
    'Текст має містити від 1 до {max} символів.',
    'The text must contain between 1 and {max} characters.',
  ],
  'reminder.datePrompt': [
    '<b>Когда напомнить?</b>\n\n<b>Формат:</b>\n<code>ДД.ММ.ГГГГ ЧЧ:ММ</code>\n\n<b>Например:</b>\n<code>{dateTimeExample}</code>\n\n<b>Время можно не указывать:</b>\n<code>{dateOnlyExample}</code>\n\nТогда напоминание придёт в 09:00 по Киеву.',
    '<b>Коли нагадати?</b>\n\n<b>Формат:</b>\n<code>ДД.ММ.РРРР ГГ:ХХ</code>\n\n<b>Наприклад:</b>\n<code>{dateTimeExample}</code>\n\n<b>Час можна не вказувати:</b>\n<code>{dateOnlyExample}</code>\n\nТоді нагадування надійде о 09:00 за Києвом.',
    '<b>When should I remind you?</b>\n\n<b>Format:</b>\n<code>DD.MM.YYYY HH:MM</code>\n\n<b>Example:</b>\n<code>{dateTimeExample}</code>\n\n<b>Time is optional:</b>\n<code>{dateOnlyExample}</code>\n\nThe reminder will then arrive at 09:00 Kyiv time.',
  ],
  'reminder.invalidDate': [
    'Не понял дату. Используйте формат ДД.ММ.ГГГГ и, при необходимости, время ЧЧ:ММ.',
    'Не зрозумів дату. Використовуйте формат ДД.ММ.РРРР і, за потреби, час ГГ:ХХ.',
    'Could not parse the date. Use DD.MM.YYYY and optionally HH:MM.',
  ],
  'reminder.pastDate': [
    'Это время уже прошло. Укажите будущую дату и время.',
    'Цей час уже минув. Вкажіть майбутню дату й час.',
    'That time has already passed. Enter a future date and time.',
  ],
  'reminder.confirmTitle': ['Проверьте напоминание', 'Перевірте нагадування', 'Check the reminder'],
  'reminder.textLabel': ['Текст', 'Текст', 'Text'],
  'reminder.whenLabel': ['Когда', 'Коли', 'When'],
  'reminder.repeatLabel': ['Повтор', 'Повторення', 'Repeat'],
  'reminder.repeatQuestion': [
    'Как повторять напоминание?',
    'Як повторювати нагадування?',
    'How should the reminder repeat?',
  ],
  'reminder.repeatQuestionHint': [
    'Дата выше будет первой отправкой.',
    'Дата вище буде першим надсиланням.',
    'The date above will be the first delivery.',
  ],
  'reminder.repeatNone': ['Не повторять', 'Не повторювати', 'Do not repeat'],
  'reminder.repeatInterval': ['Каждые N минут', 'Кожні N хвилин', 'Every N minutes'],
  'reminder.repeatDaily': ['Каждый день', 'Щодня', 'Every day'],
  'reminder.repeatWeekly': ['Каждую неделю', 'Щотижня', 'Every week'],
  'reminder.repeatMonthly': ['Каждый месяц', 'Щомісяця', 'Every month'],
  'reminder.repeatYearly': ['Каждый год', 'Щороку', 'Every year'],
  'reminder.repeatIntervalPrompt': [
    'Через сколько минут повторять?',
    'Через скільки хвилин повторювати?',
    'How many minutes between deliveries?',
  ],
  'reminder.repeatIntervalHint': [
    'Выберите кнопку или отправьте целое число от {min} до {max}.',
    'Оберіть кнопку або надішліть ціле число від {min} до {max}.',
    'Choose a button or send an integer from {min} to {max}.',
  ],
  'reminder.repeatIntervalInvalid': [
    'Укажите целое количество минут от {min} до {max}.',
    'Вкажіть цілу кількість хвилин від {min} до {max}.',
    'Enter a whole number of minutes from {min} to {max}.',
  ],
  'reminder.repeatLimitPrompt': [
    'Сколько раз отправить всего?',
    'Скільки разів надіслати загалом?',
    'How many total deliveries?',
  ],
  'reminder.repeatLimitIntervalHint': [
    'Выберите кнопку или отправьте число от 2 до 100. Первая отправка входит в это количество.',
    'Оберіть кнопку або надішліть число від 2 до 100. Перше надсилання входить у цю кількість.',
    'Choose a button or send a number from 2 to 100. The first delivery counts toward this total.',
  ],
  'reminder.repeatLimitCalendarHint': [
    'Выберите кнопку, отправьте число от 2 до 1000 или выберите «Без ограничения». Первая отправка входит в это количество.',
    'Оберіть кнопку, надішліть число від 2 до 1000 або виберіть «Без обмеження». Перше надсилання входить у цю кількість.',
    'Choose a button, send a number from 2 to 1000, or choose unlimited. The first delivery counts toward this total.',
  ],
  'reminder.repeatLimitInvalid': [
    'Укажите целое количество отправок от {min} до {max}.',
    'Вкажіть цілу кількість надсилань від {min} до {max}.',
    'Enter a whole number of deliveries from {min} to {max}.',
  ],
  'reminder.repeatUnlimited': ['Без ограничения', 'Без обмеження', 'Unlimited'],
  'reminder.repeatMinutesOption': ['{minutes} мин.', '{minutes} хв.', '{minutes} min'],
  'reminder.repeatCountOption': ['×{count}', '×{count}', '×{count}'],
  'reminder.repeatEveryMinutes': [
    'Каждые {minutes} мин.',
    'Кожні {minutes} хв.',
    'Every {minutes} min',
  ],
  'reminder.repeatTotal': [
    'отправок всего: {count}',
    'надсилань загалом: {count}',
    'total deliveries: {count}',
  ],
  'reminder.repeatUnlimitedSummary': ['без ограничения', 'без обмеження', 'unlimited'],
  'reminder.repeatSentFinite': [
    'отправлено {sent}/{total}',
    'надіслано {sent}/{total}',
    'sent {sent}/{total}',
  ],
  'reminder.repeatSentUnlimited': ['отправлено {count}', 'надіслано {count}', 'sent {count}'],
  'reminder.save': ['✅ Сохранить', '✅ Зберегти', '✅ Save'],
  'reminder.editText': ['✏️ Текст', '✏️ Текст', '✏️ Text'],
  'reminder.editDate': ['📅 Дата', '📅 Дата', '📅 Date'],
  'reminder.editRepeat': ['🔁 Повтор', '🔁 Повторення', '🔁 Repeat'],
  'reminder.saved': ['Напоминание сохранено', 'Нагадування збережено', 'Reminder saved'],
  'reminder.listTitle': ['Мои напоминания', 'Мої нагадування', 'My reminders'],
  'reminder.empty': [
    'Активных напоминаний пока нет.',
    'Активних нагадувань поки немає.',
    'There are no active reminders yet.',
  ],
  'reminder.more': ['И ещё: {count}.', 'І ще: {count}.', 'And {count} more.'],
  'reminder.deleteItem': ['🗑 Удалить {number}', '🗑 Видалити {number}', '🗑 Delete {number}'],
  'reminder.deleted': ['Напоминание удалено.', 'Нагадування видалено.', 'Reminder deleted.'],
  'reminder.stale': [
    'Эта панель уже неактивна. Вызовите /reminder заново.',
    'Ця панель уже неактивна. Викличте /reminder знову.',
    'This panel is no longer active. Run /reminder again.',
  ],
  'reminder.notificationTitle': ['⏰ Напоминание', '⏰ Нагадування', '⏰ Reminder'],
  'reminder.notificationScheduled': [
    'Запланировано на: {date}',
    'Заплановано на: {date}',
    'Scheduled for: {date}',
  ],
} as const satisfies Record<string, readonly [string, string, string]>;

export type TranslationKey = keyof typeof translations;

export function getLocale(userId: number | undefined): Locale {
  return userId ? (localesByUserId.get(userId) ?? defaultLocale) : defaultLocale;
}

export function setLocale(userId: number, locale: Locale): void {
  localesByUserId.set(userId, locale);
}

export function isLocale(value: string): value is Locale {
  return supportedLocales.includes(value as Locale);
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  parameters: Record<string, string | number> = {},
): string {
  const template = translations[key][localeIndexes[locale]];

  return template.replaceAll(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = parameters[name];
    return value === undefined ? placeholder : String(value);
  });
}

export function dateLocale(locale: Locale): string {
  switch (locale) {
    case 'uk':
      return 'uk-UA';
    case 'en':
      return 'en-US';
    default:
      return 'ru-RU';
  }
}
