import {
  applyDecorators,
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Observable, mergeMap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

/** The entities one audit row concerns; each Apex detail page lists its own. */
export type AuditTargets = { userId?: string | null; spaceId?: string | null; eventId?: string | null };

type AuditRequest = { params: Record<string, string>; body: Record<string, unknown> | undefined };
type Resolve = (req: AuditRequest, prisma: PrismaService) => AuditTargets | Promise<AuditTargets>;

const AUDIT = 'audit';

/**
 * F5: record a successful admin change (permission, role, status, plan,
 * reconcile) in `audit_logs`: who, when, what (`action` + the request's
 * params and body) and on which user/space/event. `targets` maps the request
 * to those ids; it runs before the handler, so a delete can still look up the
 * row that names them.
 */
export const Audit = (action: string, targets: Resolve = () => ({})) =>
  applyDecorators(SetMetadata(AUDIT, { action, targets }), UseInterceptors(AuditInterceptor));

/**
 * Writes the row after the handler succeeds. A failed write is logged, never
 * turned into a failed request: the change itself already happened.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<{ action: string; targets: Resolve }>(AUDIT, context.getHandler());
    if (!meta) return next.handle();
    const req = context.switchToHttp().getRequest();
    const targets = Promise.resolve()
      .then(() => meta.targets({ params: req.params ?? {}, body: req.body }, this.prisma))
      .catch(() => ({}) as AuditTargets);
    return next.handle().pipe(
      mergeMap(async (res) => {
        try {
          const ids = await targets;
          await this.prisma.auditLog.create({
            data: {
              action: meta.action,
              actorId: req.user?.id ?? null,
              userId: ids.userId ?? null,
              spaceId: ids.spaceId ?? null,
              eventId: ids.eventId ?? null,
              data: { params: req.params ?? {}, body: req.body ?? {} } as Prisma.InputJsonValue,
            },
          });
        } catch (err) {
          this.logger.error(`Audit write for ${meta.action} failed: ${err instanceof Error ? err.message : err}`);
        }
        return res;
      }),
    );
  }
}
