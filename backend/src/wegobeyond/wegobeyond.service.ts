import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { sniffImage, StorageService } from '../storage/storage.service';
import {
  DOC_NAMES,
  DOCS,
  isDocName,
  validateDoc,
  type DocName,
} from './wegobeyond.schema';
import {
  COLUMN_FIELDS,
  validateSubmission,
  type CrewFormDef,
} from './crew-form';

/** The image types a gallery photo may be, read from its bytes. */
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * WeGoBeyond (wegobeyond.in) site content and crew sign-ups. The site reads the
 * six documents publicly; Apex edits them (platform admins only). Events are not
 * here: the site reads those from the `beyond` space like any other client.
 */
@Injectable()
export class WegobeyondService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private docName(name: string): DocName {
    if (!isDocName(name))
      throw new NotFoundException('No such WeGoBeyond document');
    return name;
  }

  /** PUBLIC: every document's data, keyed by name. */
  async publicContent() {
    const rows = await this.prisma.wegobeyondDoc.findMany({
      select: { name: true, data: true },
    });
    const byName = new Map(rows.map((r) => [r.name, r.data]));
    return Object.fromEntries(DOC_NAMES.map((n) => [n, byName.get(n) ?? null]));
  }

  /** PUBLIC: one document's data. */
  async publicDoc(name: string) {
    const row = await this.prisma.wegobeyondDoc.findUnique({
      where: { name: this.docName(name) },
    });
    if (!row) throw new NotFoundException('No such WeGoBeyond document');
    return row.data;
  }

  /** ADMIN: a document with its form spec and the version a save must name. */
  async adminDoc(name: string) {
    const doc = this.docName(name);
    const row = await this.prisma.wegobeyondDoc.findUnique({
      where: { name: doc },
    });
    if (!row) throw new NotFoundException('No such WeGoBeyond document');
    return {
      name: doc,
      spec: DOCS[doc],
      data: row.data,
      version: row.version,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * ADMIN: validate, normalise and save, only if nobody saved since `version`
   * (the check and the write are one statement, so two saves can't both win).
   */
  async save(name: string, input: unknown, version: number, userId: string) {
    const doc = this.docName(name);
    const result = validateDoc(doc, input);
    if (!result.ok) throw new BadRequestException(result.errors);

    const { count } = await this.prisma.wegobeyondDoc.updateMany({
      where: { name: doc, version },
      data: {
        data: result.value as Prisma.InputJsonValue,
        version: { increment: 1 },
        updatedById: userId,
      },
    });
    if (count === 0) {
      throw new ConflictException(
        'This was saved by someone else since you opened it. Reload, then redo your change.',
      );
    }
    return this.adminDoc(doc);
  }

  /** ADMIN: store a gallery photo; the key is ours, the type comes from its bytes. */
  async uploadPhoto(file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Attach a photo');
    const type = sniffImage(file.buffer);
    if (!type || !PHOTO_TYPES.has(type.mime)) {
      throw new BadRequestException('Upload a JPG, PNG or WebP photo.');
    }
    return {
      url: await this.storage.uploadFile(
        file,
        'wegobeyond/gallery/',
        randomUUID(),
      ),
    };
  }

  /**
   * PUBLIC: a "Join the crew" sign-up, checked against the form's current
   * questions (validateSubmission: choices must be the question's own options,
   * formats and lengths are capped). Field errors come back as a 422 `message`
   * map keyed by question id. Answers to questions without their own column go
   * in `answers`, keyed by question id.
   */
  async signUp(body: Record<string, unknown>) {
    // Honeypot: real people never see company_website. Accept bots so they don't
    // retry, and store nothing.
    if (str(body.company_website)) return { ok: true };

    const form = (await this.publicDoc('crew')) as unknown as CrewFormDef;
    const { errors, clean } = validateSubmission(form, body);
    if (body.consent !== true) errors.consent = 'Please agree to be contacted.';
    if (Object.keys(errors).length)
      throw new UnprocessableEntityException({ message: errors });

    // A column question an admin re-typed (say, role as pick-any) still fits.
    const one = (id: string) => {
      const v = clean[id] ?? '';
      return Array.isArray(v) ? v.join(', ') : v;
    };
    const many = (id: string) => {
      const v = clean[id] ?? [];
      return Array.isArray(v) ? v : v ? [v] : [];
    };
    const columns = new Set<string>(COLUMN_FIELDS);
    await this.prisma.wegobeyondCrewSignup.create({
      data: {
        name: one('name'),
        email: one('email'),
        phone: one('phone'),
        city: one('city'),
        organization: one('organization'),
        role: one('role'),
        interests: many('interests'),
        availability: many('availability'),
        experience: one('experience'),
        links: one('links'),
        answers: Object.fromEntries(
          Object.entries(clean).filter(([id]) => !columns.has(id)),
        ),
      },
    });
    return { ok: true };
  }

  /** ADMIN: sign-ups, newest first. */
  listSignups() {
    // ponytail: newest 2000 in one response; page it if the crew outgrows that.
    return this.prisma.wegobeyondCrewSignup.findMany({
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
  }
}
