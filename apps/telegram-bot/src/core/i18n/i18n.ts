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
  'command.stats.description': [
    'Показать статистику планов',
    'Показати статистику планів',
    'Show plan statistics',
  ],
  'command.reminder.description': [
    'Создать напоминание',
    'Створити нагадування',
    'Create a reminder',
  ],
  'ping.response': ['pong', 'pong', 'pong'],
  'start.greeting': [
    'Привет! Я Aion — личный помощник для планов, напоминаний и отчётов.',
    'Привіт! Я Aion — особистий помічник для планів, нагадувань і звітів.',
    'Hi! I’m Aion, your personal assistant for plans, reminders, and reports.',
  ],
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
    'Напишите название нового пункта — до {max} символов.',
    'Напишіть назву нового пункту — до {max} символів.',
    'Enter the new item title — up to {max} characters.',
  ],
  'daily.itemDraft': ['Пункт плана:', 'Пункт плану:', 'Plan item:'],
  'daily.descriptionChoice': [
    'Добавить подробное описание?',
    'Додати детальний опис?',
    'Add a detailed description?',
  ],
  'daily.addDescription': ['📝 Добавить описание', '📝 Додати опис', '📝 Add description'],
  'daily.withoutDescription': ['✅ Без описания', '✅ Без опису', '✅ No description'],
  'daily.descriptionPrompt': [
    'Напишите описание пункта — до {max} символов. В общем плане оно не отображается.',
    'Напишіть опис пункту — до {max} символів. У загальному плані він не відображається.',
    'Enter the item description — up to {max} characters. It is hidden from the main plan.',
  ],
  'daily.titleLabel': ['Название:', 'Назва:', 'Title:'],
  'daily.descriptionLabel': ['Описание:', 'Опис:', 'Description:'],
  'daily.noDescription': ['Описание не добавлено.', 'Опис не додано.', 'No description added.'],
  'daily.clearDescription': ['🗑 Удалить описание', '🗑 Видалити опис', '🗑 Remove description'],
  'daily.descriptionCleared': ['Описание удалено', 'Опис видалено', 'Description removed'],
  'daily.itemAdded': ['Пункт добавлен', 'Пункт додано', 'Item added'],
  'daily.actionExpired': [
    'Это действие уже устарело.',
    'Ця дія вже застаріла.',
    'This action has expired.',
  ],
  'daily.cancel': ['🚫 Отмена', '🚫 Скасувати', '🚫 Cancel'],
  'daily.cancelled': ['Отменено', 'Скасовано', 'Cancelled'],
  'daily.deletePrompt': ['Удалить пункт?', 'Видалити пункт?', 'Delete this item?'],
  'daily.delete': ['🗑 Удалить', '🗑 Видалити', '🗑 Delete'],
  'daily.editPrompt': [
    'Введите новое название пункта — до {max} символов:',
    'Введіть нову назву пункту — до {max} символів:',
    'Enter the new item title — up to {max} characters:',
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
  'daily.emptyDescription': [
    'Описание не может быть пустым.',
    'Опис не може бути порожнім.',
    'The description cannot be empty.',
  ],
  'daily.itemTooLong': [
    'Сократите пункт до {max} символов.',
    'Скоротіть пункт до {max} символів.',
    'Shorten the item to {max} characters.',
  ],
  'daily.descriptionTooLong': [
    'Сократите описание до {max} символов.',
    'Скоротіть опис до {max} символів.',
    'Shorten the description to {max} characters.',
  ],
  'daily.title': ['План на сегодня', 'План на сьогодні', "Today's plan"],
  'daily.emptyPlan': ['План пока пуст.', 'План поки порожній.', 'The plan is empty.'],
  'daily.completedHidden': [
    'Все выполненные пункты скрыты.',
    'Усі виконані пункти приховані.',
    'All completed items are hidden.',
  ],
  'daily.completed': ['выполнено', 'виконано', 'completed'],
  'daily.managementTitle': ['Управление планом', 'Керування планом', 'Plan management'],
  'daily.managementHint': [
    'Выберите пункт, чтобы изменить его название или описание.',
    'Виберіть пункт, щоб змінити його назву або опис.',
    'Select an item to change its title or description.',
  ],
  'daily.itemDetailsTitle': ['Пункт {number}', 'Пункт {number}', 'Item {number}'],
  'daily.editTitle': ['✏️ Изменить название', '✏️ Змінити назву', '✏️ Change title'],
  'daily.editDescription': ['📝 Изменить описание', '📝 Змінити опис', '📝 Change description'],
  'daily.backToManagement': ['⬅️ К списку пунктов', '⬅️ До списку пунктів', '⬅️ Back to items'],
  'daily.noItems': [
    'В плане нет пунктов.',
    'У плані немає пунктів.',
    'There are no items in the plan.',
  ],
  'daily.add': ['➕ Добавить', '➕ Додати', '➕ Add'],
  'daily.manage': ['⚙️ Управление', '⚙️ Керування', '⚙️ Manage'],
  'daily.hideCompleted': [
    '🙈 Скрыть выполненные ({count})',
    '🙈 Сховати виконані ({count})',
    '🙈 Hide completed ({count})',
  ],
  'daily.showCompleted': [
    '👁 Показать выполненные ({count})',
    '👁 Показати виконані ({count})',
    '👁 Show completed ({count})',
  ],
  'daily.markCompleted': ['✅ Отметить выполненным', '✅ Позначити виконаним', '✅ Mark completed'],
  'daily.markIncomplete': ['↩️ Вернуть в работу', '↩️ Повернути в роботу', '↩️ Mark incomplete'],
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
  'report.menuTitle': [
    '<b>Личные отчёты</b>\n\nАвтор: <b>{author}</b>\nНачало отсчёта: <code>{date}</code>\nСейчас: неделя <b>{week}</b>, день <b>{day}</b>',
    '<b>Особисті звіти</b>\n\nАвтор: <b>{author}</b>\nПочаток відліку: <code>{date}</code>\nЗараз: тиждень <b>{week}</b>, день <b>{day}</b>',
    '<b>Personal reports</b>\n\nAuthor: <b>{author}</b>\nTracking started: <code>{date}</code>\nCurrent: week <b>{week}</b>, day <b>{day}</b>',
  ],
  'report.start': ['📝 Создать отчёт', '📝 Створити звіт', '📝 Create report'],
  'report.history': ['🗂 История отчётов', '🗂 Історія звітів', '🗂 Report history'],
  'report.historyTitle': [
    '<b>История отчётов</b>',
    '<b>Історія звітів</b>',
    '<b>Report history</b>',
  ],
  'report.historyFilter': [
    'Фильтр: <b>{type}</b>',
    'Фільтр: <b>{type}</b>',
    'Filter: <b>{type}</b>',
  ],
  'report.historyHint': [
    'Выберите дату или неделю.',
    'Оберіть дату або тиждень.',
    'Choose a date or week.',
  ],
  'report.historyEmpty': [
    'Сохранённых отчётов пока нет. История ведётся только с момента обновления.',
    'Збережених звітів поки немає. Історія ведеться лише з моменту оновлення.',
    'There are no saved reports yet. History starts from this update.',
  ],
  'report.historyAll': ['Все', 'Усі', 'All'],
  'report.historyDaily': ['Дни', 'Дні', 'Days'],
  'report.historyWeekly': ['Недели', 'Тижні', 'Weeks'],
  'report.historyStatistics': ['Статистика планов', 'Статистика планів', 'Plan statistics'],
  'report.historyStatisticsItem': ['Планы', 'Плани', 'Plans'],
  'report.historyStatisticsHint': [
    'Здесь хранятся автоматические снимки статистики задач. Интерактивный просмотр недель — в /stats. Личные недельные отчёты находятся во вкладке «Недели».',
    'Тут зберігаються автоматичні знімки статистики завдань. Інтерактивний перегляд тижнів — у /stats. Особисті тижневі звіти знаходяться у вкладці «Тижні».',
    'These are saved automatic task-statistics snapshots. Browse weeks interactively with /stats. Personal weekly reports are under “Weeks”.',
  ],
  'report.historyPrevious': ['⬅️ Новее', '⬅️ Новіші', '⬅️ Newer'],
  'report.historyNext': ['Раньше ➡️', 'Раніші ➡️', 'Older ➡️'],
  'report.existingTitle': [
    '<b>Отчёт уже создан</b>',
    '<b>Звіт уже створено</b>',
    '<b>Report already exists</b>',
  ],
  'report.existingPeriod': [
    '{type}: <code>{start} — {end}</code>',
    '{type}: <code>{start} — {end}</code>',
    '{type}: <code>{start} — {end}</code>',
  ],
  'report.existingHint': [
    'Можно открыть его, изменить сохранённые ответы или заполнить заново.',
    'Можна відкрити його, змінити збережені відповіді або заповнити заново.',
    'You can open it, edit the saved answers, or fill it in again.',
  ],
  'report.existingOpen': ['📄 Открыть', '📄 Відкрити', '📄 Open'],
  'report.existingEdit': ['✏️ Редактировать', '✏️ Редагувати', '✏️ Edit'],
  'report.existingRefill': ['🔄 Заполнить заново', '🔄 Заповнити заново', '🔄 Fill again'],
  'report.legacyEditUnavailable': [
    'Этот отчёт создан до поддержки редактирования. Его можно заполнить заново.',
    'Цей звіт створено до підтримки редагування. Його можна заповнити заново.',
    'This report predates editable answers. You can fill it in again.',
  ],
  'report.deliveryBusy': [
    'Отчёт уже отправляется. Подождите немного и попробуйте ещё раз.',
    'Звіт уже надсилається. Зачекайте трохи й спробуйте ще раз.',
    'This report is already being sent. Wait a moment and try again.',
  ],
  'report.settings': ['⚙️ Настройки', '⚙️ Налаштування', '⚙️ Settings'],
  'report.settingsTitle': [
    '<b>Настройки отчётов</b>\n\nЧто хотите изменить?',
    '<b>Налаштування звітів</b>\n\nЩо бажаєте змінити?',
    '<b>Report settings</b>\n\nWhat would you like to change?',
  ],
  'report.editAuthor': ['👤 Имя и хэштег', '👤 Ім’я та хештег', '👤 Name and hashtag'],
  'report.editCalendar': ['🗓 Календарь отчётов', '🗓 Календар звітів', '🗓 Report calendar'],
  'report.dailyStructure': ['☀️ Структура дневного', '☀️ Структура денного', '☀️ Daily structure'],
  'report.weeklyStructure': [
    '📊 Структура недельного',
    '📊 Структура тижневого',
    '📊 Weekly structure',
  ],
  'report.configurationTitle': [
    '<b>Структура: {type}</b>',
    '<b>Структура: {type}</b>',
    '<b>Structure: {type}</b>',
  ],
  'report.configurationHint': [
    'Нажмите на раздел, чтобы включить или выключить его. Стрелками меняется порядок. Сохранится только список ниже.',
    'Натисніть розділ, щоб увімкнути або вимкнути його. Стрілками змінюється порядок. Збережеться лише список нижче.',
    'Tap a section to enable or disable it. Use arrows to change the order. Only the list below will be saved.',
  ],
  'report.builderHint': [
    'Нажмите на поле, чтобы изменить название, подсказку и тип. Стрелками меняется порядок.',
    'Натисніть поле, щоб змінити назву, підказку й тип. Стрілками змінюється порядок.',
    'Tap a field to change its title, prompt, and type. Use arrows to change the order.',
  ],
  'report.addField': ['➕ Добавить поле', '➕ Додати поле', '➕ Add field'],
  'report.newField': ['Новое поле', 'Нове поле', 'New field'],
  'report.maxFields': [
    'В одном отчёте может быть не больше {max} полей.',
    'В одному звіті може бути не більше {max} полів.',
    'A report can contain at most {max} fields.',
  ],
  'report.fieldEditorTitle': [
    '<b>Редактор поля</b>',
    '<b>Редактор поля</b>',
    '<b>Field editor</b>',
  ],
  'report.fieldType': ['Тип', 'Тип', 'Type'],
  'report.fieldRequired': ['Обязательное', 'Обов’язкове', 'Required'],
  'report.fieldPromptEmpty': [
    'Подсказка не задана.',
    'Підказку не задано.',
    'No prompt configured.',
  ],
  'report.renameField': ['✏️ Изменить название', '✏️ Змінити назву', '✏️ Rename'],
  'report.editPrompt': ['💬 Изменить подсказку', '💬 Змінити підказку', '💬 Edit prompt'],
  'report.clearPrompt': ['🧹 Убрать подсказку', '🧹 Прибрати підказку', '🧹 Clear prompt'],
  'report.deleteField': ['🗑 Удалить поле', '🗑 Видалити поле', '🗑 Delete field'],
  'report.fieldType.text': ['Текст', 'Текст', 'Text'],
  'report.fieldType.list': ['Список', 'Список', 'List'],
  'report.fieldType.rating': ['Оценка 1–10', 'Оцінка 1–10', 'Rating 1–10'],
  'report.fieldType.boolean': ['Да / нет', 'Так / ні', 'Yes / no'],
  'report.listStyle.dash': ['С тире', 'З тире', 'Dashes'],
  'report.listStyle.numbered': ['Нумерованный', 'Нумерований', 'Numbered'],
  'report.listStyle.status': ['Со статусами', 'Зі статусами', 'With statuses'],
  'report.fieldTitlePrompt': [
    '<b>Название поля</b>\n\nВведите новое название одним сообщением (до 80 символов).',
    '<b>Назва поля</b>\n\nВведіть нову назву одним повідомленням (до 80 символів).',
    '<b>Field title</b>\n\nSend the new title in one message (up to 80 characters).',
  ],
  'report.fieldPromptPrompt': [
    '<b>Подсказка поля</b>\n\nВведите текст, который пользователь увидит при заполнении (до 240 символов).',
    '<b>Підказка поля</b>\n\nВведіть текст, який користувач побачить під час заповнення (до 240 символів).',
    '<b>Field prompt</b>\n\nSend the text shown while filling this field (up to 240 characters).',
  ],
  'report.fieldTitleInvalid': [
    'Название должно содержать от 1 до 80 символов.',
    'Назва має містити від 1 до 80 символів.',
    'The title must contain 1 to 80 characters.',
  ],
  'report.fieldPromptInvalid': [
    'Подсказка должна быть не длиннее 240 символов.',
    'Підказка має бути не довшою за 240 символів.',
    'The prompt must not exceed 240 characters.',
  ],
  'report.save': ['💾 Сохранить', '💾 Зберегти', '💾 Save'],
  'report.settingsSaved': ['Настройки сохранены.', 'Налаштування збережено.', 'Settings saved.'],
  'report.atLeastOneSection': [
    'Оставьте хотя бы один раздел.',
    'Залиште хоча б один розділ.',
    'Keep at least one section.',
  ],
  'report.daily': ['Дневной', 'Денний', 'Daily'],
  'report.weekly': ['Недельный', 'Тижневий', 'Weekly'],
  'report.cancel': ['🚫 Прервать заполнение', '🚫 Перервати заповнення', '🚫 Stop filling'],
  'report.close': ['✖️ Закрыть', '✖️ Закрити', '✖️ Close'],
  'report.closed': ['Панель отчётов закрыта.', 'Панель звітів закрито.', 'Report panel closed.'],
  'report.cancelled': ['Сбор отчёта отменён.', 'Збір звіту скасовано.', 'Report cancelled.'],
  'report.setupAuthorPrompt': [
    '<b>Настройка личных отчётов</b>\n\nВведите имя и фамилию одним сообщением. На их основе я создам хэштег для ваших отчётов.\n\nНапример: <code>Александр Степанов</code>',
    '<b>Налаштування особистих звітів</b>\n\nВведіть ім’я та прізвище одним повідомленням. На їх основі я створю хештег для ваших звітів.\n\nНаприклад: <code>Олександр Степанов</code>',
    '<b>Personal report setup</b>\n\nEnter your first and last name in one message. I will use them to create a hashtag for your reports.\n\nExample: <code>Alex Stepanov</code>',
  ],
  'report.setupAuthorInvalid': [
    'Введите имя и фамилию словами, например: Александр Степанов.',
    'Введіть ім’я та прізвище словами, наприклад: Олександр Степанов.',
    'Enter your first and last name, for example: Alex Stepanov.',
  ],
  'report.setupStartDatePrompt': [
    '<b>Календарь отчётов</b>\n\nМожно указать дату первого отчёта или текущие номер недели и день. «Текущая дата» означает неделю 1, день 1.',
    '<b>Календар звітів</b>\n\nМожна вказати дату першого звіту або поточні номер тижня й день. «Поточна дата» означає тиждень 1, день 1.',
    '<b>Report calendar</b>\n\nEnter the first report date or your current week and day numbers. “Current date” means week 1, day 1.',
  ],
  'report.setupCustomDate': ['📅 Дата начала', '📅 Дата початку', '📅 Start date'],
  'report.setupWeekDay': ['#️⃣ Неделя и день', '#️⃣ Тиждень і день', '#️⃣ Week and day'],
  'report.setupToday': ['🟢 Текущая дата', '🟢 Поточна дата', '🟢 Current date'],
  'report.setupCustomDatePrompt': [
    '<b>Введите дату начала отчётов</b>\n\nФормат: <code>ДД.ММ.ГГГГ</code>\nНапример: <code>13.10.2025</code>',
    '<b>Введіть дату початку звітів</b>\n\nФормат: <code>ДД.ММ.РРРР</code>\nНаприклад: <code>13.10.2025</code>',
    '<b>Enter the report start date</b>\n\nFormat: <code>DD.MM.YYYY</code>\nExample: <code>13.10.2025</code>',
  ],
  'report.setupDateInvalid': [
    'Введите существующую дату не позднее сегодняшней в формате ДД.ММ.ГГГГ.',
    'Введіть дійсну дату не пізніше сьогоднішньої у форматі ДД.ММ.РРРР.',
    'Enter a valid date no later than today in DD.MM.YYYY format.',
  ],
  'report.setupWeekDayPrompt': [
    '<b>Текущие неделя и день</b>\n\nВведите два числа: сначала номер недели, затем номер дня от 1 до 7.\nНапример: <code>12 4</code>',
    '<b>Поточні тиждень і день</b>\n\nВведіть два числа: спочатку номер тижня, потім номер дня від 1 до 7.\nНаприклад: <code>12 4</code>',
    '<b>Current week and day</b>\n\nEnter two numbers: the week number, then a day from 1 to 7.\nExample: <code>12 4</code>',
  ],
  'report.setupWeekDayInvalid': [
    'Введите номер недели от 1 и номер дня от 1 до 7, например: 12 4.',
    'Введіть номер тижня від 1 і номер дня від 1 до 7, наприклад: 12 4.',
    'Enter a week number starting at 1 and a day from 1 to 7, for example: 12 4.',
  ],
  'report.next': ['⏩️ Дальше', '⏩️ Далі', '⏩️ Next'],
  'report.skip': ['⏩️ Пропустить', '⏩️ Пропустити', '⏩️ Skip'],
  'report.back': ['⏪️ Назад', '⏪️ Назад', '⏪️ Back'],
  'report.clear': ['🗑️ Очистить', '🗑️ Очистити', '🗑️ Clear'],
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
    'Выберите оценку от 1 до 10.',
    'Оберіть оцінку від 1 до 10.',
    'Choose a rating from 1 to 10.',
  ],
  'report.booleanPrompt': [
    'Выберите один из вариантов.',
    'Оберіть один із варіантів.',
    'Choose one of the options.',
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
  'statistics.weeklyTitle': [
    '<b>📈 Статистика планов за неделю</b>',
    '<b>📈 Статистика планів за тиждень</b>',
    '<b>📈 Weekly plan statistics</b>',
  ],
  'statistics.period': ['{start} — {end}', '{start} — {end}', '{start} — {end}'],
  'statistics.tasks': ['Задач: <b>{count}</b>', 'Завдань: <b>{count}</b>', 'Tasks: <b>{count}</b>'],
  'statistics.completed': [
    'Выполнено: <b>{completed}/{total}</b> ({rate}%)',
    'Виконано: <b>{completed}/{total}</b> ({rate}%)',
    'Completed: <b>{completed}/{total}</b> ({rate}%)',
  ],
  'statistics.unfinished': [
    'Не выполнено и перенесено: <b>{count}</b>',
    'Не виконано й перенесено: <b>{count}</b>',
    'Unfinished and carried over: <b>{count}</b>',
  ],
  'statistics.carries': [
    'Всего переносов: <b>{count}</b>',
    'Усього переносів: <b>{count}</b>',
    'Total carry-overs: <b>{count}</b>',
  ],
  'statistics.mostCarried': [
    '<b>Чаще всего переносились:</b>',
    '<b>Найчастіше переносилися:</b>',
    '<b>Most frequently carried over:</b>',
  ],
  'statistics.noCarried': [
    'На этой неделе повторных переносов не было.',
    'Цього тижня повторних переносів не було.',
    'There were no repeated carry-overs this week.',
  ],
  'statistics.previous': ['⬅️ Раньше', '⬅️ Раніше', '⬅️ Earlier'],
  'statistics.chooseDate': ['📅 Выбрать дату', '📅 Обрати дату', '📅 Choose date'],
  'statistics.next': ['Позже ➡️', 'Пізніше ➡️', 'Later ➡️'],
  'statistics.latest': ['⏩ К последней неделе', '⏩ До останнього тижня', '⏩ Latest week'],
  'statistics.datePrompt': [
    '<b>📅 Выбор недели</b>\n\nВведите любую дату нужной недели в формате <code>ДД.ММ.ГГГГ</code>.\nНапример: <code>{example}</code>',
    '<b>📅 Вибір тижня</b>\n\nВведіть будь-яку дату потрібного тижня у форматі <code>ДД.ММ.РРРР</code>.\nНаприклад: <code>{example}</code>',
    '<b>📅 Choose a week</b>\n\nEnter any date from the required week in <code>DD.MM.YYYY</code> format.\nExample: <code>{example}</code>',
  ],
  'statistics.invalidDate': [
    'Такой даты нет. Проверьте формат и попробуйте ещё раз.',
    'Такої дати немає. Перевірте формат і спробуйте ще раз.',
    'That date is invalid. Check the format and try again.',
  ],
  'statistics.incompleteWeek': [
    'Эта неделя ещё не завершена. Выберите дату из прошлой недели или раньше.',
    'Цей тиждень ще не завершено. Оберіть дату з минулого тижня або раніше.',
    'That week is not complete yet. Choose a date from last week or earlier.',
  ],
  'statistics.cancelDate': ['⬅️ Назад', '⬅️ Назад', '⬅️ Back'],
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
