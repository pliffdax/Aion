import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { v1 } from '@aion/contracts';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();

    const expected = process.env.API_KEY;
    if (!expected) {
      throw new Error('API_KEY is required');
    }

    const actual = String(req.headers[v1.ApiKeyHeaderName] ?? '');
    if (actual !== expected) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
