import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertSpaceLive } from '../spaces/space-access';
import { ApiKeysService, type ResolvedKey } from './api-keys.service';

/** Per minute: reads per key, writes per space. Writes are tighter: each can send an email or a payment link. */
export const READS_PER_MINUTE = 120;
export const WRITES_PER_MINUTE = 60;

export type ApiKeyRequest = { apiKey: ResolvedKey; headers: Record<string, string | undefined>; method: string };

/**
 * K22: lets a request through on a space's API key instead of a session.
 * Server-to-server only: CORS is global (and allows some sites), so a request
 * a browser sends, which always carries Origin, is refused here; a key in
 * a web page would be public.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ApiKeyRequest>();
    if (req.headers.origin) {
      throw new ForbiddenException('Call the Unifesto API from your server, never from a browser: your key would be public.');
    }
    const key = await this.keys.resolve(req.headers.authorization);
    if (!key) throw new UnauthorizedException('Missing or invalid API key');
    if (!key.integrationsEnabled) throw new ForbiddenException('API access is off for this space');
    await assertSpaceLive(this.prisma, { id: key.spaceId });

    // Writes count per space, so making new keys never buys more; reads per key.
    const write = req.method !== 'GET';
    const minute = Math.floor(Date.now() / 60_000);
    const who = write ? `w-${key.spaceId}` : `r-${key.id}`;
    if (await this.keys.over(`rl-${who}-${minute}`, write ? WRITES_PER_MINUTE : READS_PER_MINUTE, 60)) {
      throw new HttpException('Too many requests for this key. Slow down and retry in a minute.', HttpStatus.TOO_MANY_REQUESTS);
    }
    req.apiKey = key;
    return true;
  }
}
