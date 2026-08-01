import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parseWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  data: unknown,
): z.infer<TSchema> {
  const res = schema.safeParse(data);
  if (!res.success) {
    throw new BadRequestException({
      message: 'Validation failed',
      issues: res.error.issues,
    });
  }
  return res.data;
}

export function parseBody<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  data: unknown,
): z.infer<TSchema> {
  return parseWithSchema(schema, data);
}
