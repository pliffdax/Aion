import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      ok: true,
      mode: process.env.MODE ?? 'dev',
      database: 'ok',
    };
  }
}
