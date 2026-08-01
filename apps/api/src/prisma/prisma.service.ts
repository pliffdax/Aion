import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

function resolveDatabaseUrl(): string {
  const mode = process.env.MODE ?? 'dev';
  const url = mode === 'test' ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      mode === 'test' ? 'DATABASE_URL_TEST is required when MODE=test' : 'DATABASE_URL is required',
    );
  }

  return url;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
