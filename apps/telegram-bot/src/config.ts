import 'dotenv/config';

const botToken = process.env.BOT_TOKEN?.trim();
const botTokenTest = process.env.BOT_TOKEN_TEST?.trim();
const telegramOwnerId = process.env.TELEGRAM_OWNER_ID?.trim();
const telegramAllowedUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS?.trim();
const mode = process.env.MODE?.trim() || 'dev';
const isTestMode = mode === 'test';
const selectedBotToken = isTestMode ? botTokenTest : botToken;
const apiUrl = process.env.API_URL?.trim();
const apiUrlTest = process.env.API_URL_TEST?.trim();
const apiKey = process.env.API_KEY?.trim();

if (!selectedBotToken) {
  throw new Error(
    isTestMode ? 'BOT_TOKEN_TEST is required when MODE=test' : 'BOT_TOKEN is required',
  );
}

const selectedApiUrl = isTestMode ? apiUrlTest || apiUrl : apiUrl;

if (!selectedApiUrl) {
  throw new Error(isTestMode ? 'API_URL_TEST or API_URL is required' : 'API_URL is required');
}

if (!apiKey) {
  throw new Error('API_KEY is required');
}

if (!telegramOwnerId) {
  throw new Error('TELEGRAM_OWNER_ID is required');
}

if (!/^\d+$/.test(telegramOwnerId)) {
  throw new Error('TELEGRAM_OWNER_ID must be a positive integer');
}

const parsedTelegramOwnerId = Number(telegramOwnerId);

if (!Number.isSafeInteger(parsedTelegramOwnerId) || parsedTelegramOwnerId <= 0) {
  throw new Error('TELEGRAM_OWNER_ID must be a safe positive integer');
}

const parsedTelegramAllowedUserIds = telegramAllowedUserIds
  ? telegramAllowedUserIds.split(',').map((value, index) => {
      const userId = value.trim();

      if (!/^\d+$/.test(userId)) {
        throw new Error(`TELEGRAM_ALLOWED_USER_IDS entry ${index + 1} must be a positive integer`);
      }

      const parsedUserId = Number(userId);

      if (!Number.isSafeInteger(parsedUserId) || parsedUserId <= 0) {
        throw new Error(
          `TELEGRAM_ALLOWED_USER_IDS entry ${index + 1} must be a safe positive integer`,
        );
      }

      return parsedUserId;
    })
  : [];

export const BOT_TOKEN = selectedBotToken;
export const TELEGRAM_OWNER_ID = parsedTelegramOwnerId;
export const TELEGRAM_ALLOWED_USER_IDS = [
  ...new Set([parsedTelegramOwnerId, ...parsedTelegramAllowedUserIds]),
];
export const TELEGRAM_ACCESS_RESTRICTED = parsedTelegramAllowedUserIds.length > 0;
export const API_URL = selectedApiUrl.replace(/\/+$/, '');
export const API_KEY = apiKey;
