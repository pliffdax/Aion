export function isTelegramMessageNotModified(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('description' in error)) return false;

  const description = (error as { description?: unknown }).description;
  return typeof description === 'string' && description.includes('message is not modified');
}
