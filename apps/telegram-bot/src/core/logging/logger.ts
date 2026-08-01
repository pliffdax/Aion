import type { Context } from 'grammy';

type LogFields = Record<string, unknown>;

export function logInfo(event: string, fields: LogFields = {}): void {
  writeLog('info', event, fields);
}

export function logWarn(event: string, fields: LogFields = {}): void {
  writeLog('warn', event, fields);
}

export function logError(event: string, fields: LogFields = {}): void {
  writeLog('error', event, fields);
}

export function telegramContextFields(context: Context): LogFields {
  return {
    updateId: context.update.update_id,
    userId: context.from?.id,
    username: context.from?.username,
    chatId: context.chat?.id,
    chatType: context.chat?.type,
  };
}

export function telegramUpdateFields(context: Context): LogFields {
  const text = context.message?.text;
  const command = text?.match(/^\/([a-z0-9_]+)(?:@[a-z0-9_]+)?(?:\s|$)/i)?.[1];
  const callback = context.callbackQuery?.data;

  if (command) {
    return {
      updateType: 'command',
      command: command.toLowerCase(),
    };
  }

  if (callback) {
    return {
      updateType: 'callback',
      callback,
    };
  }

  if (text !== undefined) {
    return {
      updateType: 'text',
    };
  }

  return {
    updateType: 'other',
  };
}

function writeLog(level: 'info' | 'warn' | 'error', event: string, fields: LogFields): void {
  const message = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  if (level === 'error') {
    console.error(message);
    return;
  }

  if (level === 'warn') {
    console.warn(message);
    return;
  }

  console.log(message);
}
