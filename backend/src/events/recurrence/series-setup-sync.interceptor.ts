import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, mergeMap } from 'rxjs';
import { RecurrenceService } from './recurrence.service';

/** Event routes that change an event's setup (B17). */
const SETUP_ROUTE = /\/:id\/(ticket-types|agenda|speakers|prizes|contacts|faqs|form-fields|team)(\/|$)/;

/**
 * After a successful setup write on an event, push it to a series' future
 * occurrences (or detach an occurrence edited on its own). One place instead
 * of a call in each of the ~25 setup handlers. A sync failure is logged, never
 * turned into a failed save: the parent's edit already happened, and the
 * daily reconcile syncs again.
 */
@Injectable()
export class SeriesSetupSyncInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SeriesSetupSyncInterceptor.name);

  constructor(private readonly recurrence: RecurrenceService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const eventId: string | undefined = req.params?.id;
    const isSetupWrite = req.method !== 'GET' && SETUP_ROUTE.test(req.route?.path ?? '');
    if (!eventId || !isSetupWrite) return next.handle();
    return next.handle().pipe(
      mergeMap(async (body) => {
        try {
          await this.recurrence.afterSetupChange(eventId);
        } catch (err) {
          this.logger.error(`Series sync after setup edit on ${eventId} failed: ${err instanceof Error ? err.message : err}`);
        }
        return body;
      }),
    );
  }
}
