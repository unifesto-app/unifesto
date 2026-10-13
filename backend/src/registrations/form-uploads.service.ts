import { RedisService } from '../redis/redis.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { Action, AuthorizationService } from '../auth/authorization';
import {
  cfg,
  FILE_DEFAULT_KINDS,
  FILE_DEFAULT_MAX_MB,
  FILE_KIND_MIMES,
  FILE_MAX_MB_CAP,
  formUploadEventPrefix,
  formUploadPrefix,
  type FileAnswer,
  type FileKind,
} from './form-answers.util';

/** Days after an event ends that attendees' uploaded files are kept. */
export const FORM_UPLOAD_RETENTION_DAYS = 180;
/** How long a "view file" link works. */
const VIEW_LINK_SECONDS = 5 * 60;

/** File extension stored for each accepted type (Stay uploads reuse it). */
export const UPLOAD_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
};

/**
 * The file's real type from its first bytes, so a renamed file can't pass as
 * something else. Returns null for anything we don't accept.
 */
export function sniffMime(buf: Buffer): string | null {
  const at = (o: number, s: string) =>
    buf.subarray(o, o + s.length).toString('latin1') === s;
  if (at(0, '%PDF-')) return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return 'image/jpeg';
  if (at(0, '\x89PNG\r\n\x1a\n')) return 'image/png';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
  if (at(4, 'ftyp')) {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (['heic', 'heix', 'hevc', 'heim', 'heis'].includes(brand))
      return 'image/heic';
    if (['mif1', 'msf1'].includes(brand)) return 'image/heif';
  }
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0)
    return 'application/msword';
  // DOCX is a zip containing word/…; checking the zip magic plus the entry name
  // keeps random zips out.
  if (
    at(0, 'PK\x03\x04') &&
    buf.subarray(0, 2000).toString('latin1').includes('word/')
  ) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

@Injectable()
export class FormUploadsService {
  private readonly logger = new Logger(FormUploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly authz: AuthorizationService,
    private readonly redis: RedisService,
  ) {}

  private canManageAttendees(userId: string, eventId: string) {
    return this.authz.can({ id: userId }, Action.EVENT_MANAGE_ATTENDEES, {
      eventId,
    });
  }

  /**
   * Store one attendee's file for a FILE question. Allowed while the event
   * takes registrations, or at any time for someone who manages attendees.
   */
  async upload(
    userId: string,
    eventId: string,
    fieldId: string,
    file: Express.Multer.File | undefined,
  ): Promise<FileAnswer> {
    if (!file?.buffer?.length)
      throw new BadRequestException('Choose a file to upload.');

    const field = await this.prisma.eventFormField.findUnique({
      where: { id: fieldId },
      include: {
        event: {
          select: {
            id: true,
            status: true,
            endDateTime: true,
            deletedAt: true,
          },
        },
      },
    });
    if (!field || field.eventId !== eventId || field.event.deletedAt) {
      throw new NotFoundException('Question not found');
    }
    if (field.type !== 'FILE')
      throw new BadRequestException('This question does not take a file.');

    const open =
      field.event.status === 'PUBLISHED' &&
      field.event.endDateTime > new Date();
    if (!open && !(await this.canManageAttendees(userId, eventId))) {
      throw new ForbiddenException('This event is not taking registrations.');
    }

    const c = cfg(field);
    const maxMb = Math.min(c.maxSizeMb ?? FILE_DEFAULT_MAX_MB, FILE_MAX_MB_CAP);
    if (file.size > maxMb * 1024 * 1024) {
      throw new BadRequestException(
        `Files for this question can be up to ${maxMb} MB.`,
      );
    }
    const kinds: FileKind[] = c.fileKinds?.length
      ? c.fileKinds
      : FILE_DEFAULT_KINDS;
    const allowed = kinds.flatMap((k) => FILE_KIND_MIMES[k] ?? []);
    const mime = sniffMime(file.buffer);
    if (!mime || !allowed.includes(mime)) {
      const names = kinds
        .map((k) => ({ pdf: 'PDF', image: 'image', doc: 'Word document' })[k])
        .join(', ');
      throw new BadRequestException(`This question accepts: ${names}.`);
    }

    const key = `${formUploadPrefix(eventId, fieldId, userId)}${crypto.randomUUID()}.${UPLOAD_EXT[mime]}`;
    await this.storage.uploadPrivate(file.buffer, key, mime);
    return {
      key,
      name: (file.originalname || `file.${UPLOAD_EXT[mime]}`).slice(0, 200),
      size: file.size,
      mime,
    };
  }

  /**
   * A 5-minute link to one uploaded file: for the person who uploaded it, or
   * someone who manages this event's attendees (Crew can't open files).
   */
  async viewUrl(
    userId: string,
    eventId: string,
    key: string | undefined,
  ): Promise<{ url: string }> {
    const prefix = formUploadEventPrefix(eventId);
    if (!key || !key.startsWith(prefix) || key.includes('..')) {
      throw new BadRequestException('Unknown file.');
    }
    // private/form-uploads/{eventId}/{fieldId}/{uploaderId}/{file}
    const [fieldId, uploaderId, name] = key.slice(prefix.length).split('/');
    if (!fieldId || !uploaderId || !name)
      throw new BadRequestException('Unknown file.');

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { formUploadsPurgedAt: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.formUploadsPurgedAt) {
      throw new NotFoundException(
        `Files are deleted ${FORM_UPLOAD_RETENTION_DAYS} days after the event.`,
      );
    }
    if (
      uploaderId !== userId &&
      !(await this.canManageAttendees(userId, eventId))
    ) {
      throw new ForbiddenException('You cannot open this file.');
    }
    return {
      url: await this.storage.signedGetUrl(key, VIEW_LINK_SECONDS, name),
    };
  }

  /**
   * Retention: delete uploaded files 180 days after an event ends. Also clears
   * uploads from abandoned checkouts, which were never tied to a registration.
   */
  @Cron('30 3 * * *', { timeZone: 'Asia/Kolkata' })
  async purgeExpiredCron(): Promise<void> {
    await this.redis.runExclusive('cron:formUploadsPurge', 60 * 60, async () => {
      await this.purgeExpired();
    });
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - FORM_UPLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const events = await this.prisma.event.findMany({
      where: {
        endDateTime: { lt: cutoff },
        formUploadsPurgedAt: null,
        // Stay bookings keep guests' photo IDs under the same prefix.
        OR: [
          { formFields: { some: { type: 'FILE' } } },
          { stayBookings: { some: {} } },
        ],
      },
      select: { id: true },
      take: 200,
    });
    let files = 0;
    for (const e of events) {
      try {
        files += await this.storage.deletePrefix(formUploadEventPrefix(e.id));
        await this.prisma.event.update({
          where: { id: e.id },
          data: { formUploadsPurgedAt: now },
        });
      } catch (err) {
        // Retried tomorrow: the event stays unstamped.
        this.logger.error(`Form upload purge failed for event ${e.id}: ${err}`);
      }
    }
    if (events.length)
      this.logger.log(
        `Purged ${files} form uploads from ${events.length} events`,
      );
    return files;
  }
}
