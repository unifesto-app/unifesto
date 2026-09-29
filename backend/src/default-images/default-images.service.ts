import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DefaultImageKind } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/**
 * Stand-in banners and logos (4.0.5, item 5.3k). Admins upload a small set in
 * Apex; the apps pick one per event/space by a stable hash of its id. Order is
 * by upload time, so adding an image only moves the picks that land on it.
 */
@Injectable()
export class DefaultImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Public: the URLs the apps choose from. */
  async listPublic() {
    const rows = await this.prisma.defaultImage.findMany({
      orderBy: { createdAt: 'asc' },
      select: { kind: true, url: true },
    });
    return {
      banners: rows.filter((r) => r.kind === DefaultImageKind.BANNER).map((r) => r.url),
      logos: rows.filter((r) => r.kind === DefaultImageKind.LOGO).map((r) => r.url),
    };
  }

  listAll() {
    return this.prisma.defaultImage.findMany({ orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }] });
  }

  async add(kind: string, file: Express.Multer.File | undefined, createdById: string) {
    if (kind !== DefaultImageKind.BANNER && kind !== DefaultImageKind.LOGO) {
      throw new BadRequestException('kind must be BANNER or LOGO');
    }
    if (!file) throw new BadRequestException('Attach an image');
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      throw new BadRequestException('Use a JPEG, PNG or WebP image');
    }
    const url = await this.storage.uploadFile(file, `defaults/${kind.toLowerCase()}/`, randomUUID());
    return this.prisma.defaultImage.create({ data: { kind, url, createdById } });
  }

  async remove(id: string) {
    const res = await this.prisma.defaultImage.deleteMany({ where: { id } });
    if (res.count === 0) throw new NotFoundException('Image not found');
    return { success: true };
  }
}
