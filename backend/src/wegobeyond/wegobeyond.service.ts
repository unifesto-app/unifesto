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

/** The image types a gallery photo may be, read from its bytes. */
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const strs = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim())
    : [];

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
   * PUBLIC: a "Join the crew" sign-up. Ways to help, availability and role must
   * be options from the crew document, so a crafted request can't store
   * arbitrary values. Field errors come back as a 422 `message` map.
   */
  async signUp(body: Record<string, unknown>) {
    // Honeypot: real people never see company_website. Accept bots so they don't
    // retry, and store nothing.
    if (str(body.company_website)) return { ok: true };

    const crew = (await this.publicDoc('crew')) as {
      teams: { name: string }[];
      availability: string[];
      roles: string[];
    };
    const teams = new Set(crew.teams.map((t) => t.name));
    const availabilityOptions = new Set(crew.availability);
    const roles = new Set(crew.roles);

    const row = {
      name: str(body.name),
      email: str(body.email),
      phone: str(body.phone),
      city: str(body.city),
      organization: str(body.organization),
      role: str(body.role),
      interests: strs(body.interests).filter((i) => teams.has(i)),
      availability: strs(body.availability).filter((a) =>
        availabilityOptions.has(a),
      ),
      experience: str(body.experience),
      links: str(body.links),
    };

    const errors: Record<string, string> = {};
    if (!row.name) errors.name = 'Name is required.';
    else if (row.name.length > 120) errors.name = 'That name is too long.';
    if (!row.email) errors.email = 'Email is required.';
    else if (!EMAIL.test(row.email) || row.email.length > 254) {
      errors.email = 'That email doesn’t look right.';
    }
    if (!row.phone) errors.phone = 'A contact number is required.';
    else if (row.phone.length > 40) errors.phone = 'That number is too long.';
    if (!row.city) errors.city = 'City is required.';
    else if (row.city.length > 120) errors.city = 'That city name is too long.';
    if (row.organization.length > 200)
      errors.organization = 'Please keep this under 200 characters.';
    if (row.role && !roles.has(row.role)) errors.role = 'Pick a valid role.';
    if (row.interests.length === 0)
      errors.interests = 'Pick at least one way you’d help.';
    if (row.availability.length === 0)
      errors.availability = 'Let us know when you can help.';
    if (row.experience.length > 2000)
      errors.experience = 'Please keep this under 2000 characters.';
    if (row.links.length > 1000)
      errors.links = 'Please keep this under 1000 characters.';
    if (body.consent !== true) errors.consent = 'Please agree to be contacted.';

    if (Object.keys(errors).length)
      throw new UnprocessableEntityException({ message: errors });
    await this.prisma.wegobeyondCrewSignup.create({ data: row });
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
