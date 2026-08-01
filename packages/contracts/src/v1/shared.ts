import { z } from 'zod';

export const CuidSchema = z.string().min(1);
export const DiscordIdSchema = z.string().min(1);

export const ApiKeyHeaderName = 'x-api-key' as const;
export const AdminKeyHeaderName = 'x-admin-key' as const;

export type Infer<T extends z.ZodTypeAny> = z.infer<T>;
