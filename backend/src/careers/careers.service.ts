import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ApplicationStatus,
  Career,
  CareerStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ApplyDto, CreateCareerDto, UpdateCareerDto } from './dto';

/** Resume upload constraints. */
export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
const RESUME_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

@Injectable()
export class CareersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * The shape the public marketing site (web) expects: snake_case for the
   * multi-word fields, and only the fields a visitor needs.
   */
  private toPublic(c: Career) {
    return {
      id: c.id,
      title: c.title,
      department: c.department,
      location: c.location,
      type: c.type,
      experience_level: c.experienceLevel,
      description: c.description,
      requirements: c.requirements,
      responsibilities: c.responsibilities,
      benefits: c.benefits,
      salary_range: c.salaryRange,
      status: c.status,
      created_at: c.createdAt,
    };
  }

  // =====================================================
  // PUBLIC
  // =====================================================

  /** Open roles only, newest first, optionally filtered by department/type. */
  async listPublic(department?: string, type?: string) {
    const where: Prisma.CareerWhereInput = { status: CareerStatus.OPEN };
    if (department) where.department = department;
    if (type) where.type = type;

    const careers = await this.prisma.career.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return { data: careers.map((c) => this.toPublic(c)) };
  }

  /** One open role by id (public detail). */
  async getPublic(id: string) {
    const career = await this.prisma.career.findFirst({
      where: { id, status: CareerStatus.OPEN },
    });
    if (!career) throw new NotFoundException('Position not found');
    return { data: this.toPublic(career) };
  }

  // =====================================================
  // ADMIN
  // =====================================================

  /** All roles (any status), newest first, with application counts. */
  async listAll() {
    return this.prisma.career.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { applications: true } } },
    });
  }

  async create(dto: CreateCareerDto, adminId: string) {
    return this.prisma.career.create({
      data: {
        title: dto.title,
        department: dto.department,
        location: dto.location,
        type: dto.type,
        experienceLevel: dto.experienceLevel,
        description: dto.description,
        requirements: dto.requirements,
        responsibilities: dto.responsibilities,
        benefits: dto.benefits,
        salaryRange: dto.salaryRange ?? null,
        status: (dto.status as CareerStatus) ?? CareerStatus.DRAFT,
        createdBy: adminId,
      },
    });
  }

  async update(id: string, dto: UpdateCareerDto) {
    await this.ensureExists(id);
    return this.prisma.career.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.department !== undefined ? { department: dto.department } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.experienceLevel !== undefined
          ? { experienceLevel: dto.experienceLevel }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.requirements !== undefined
          ? { requirements: dto.requirements }
          : {}),
        ...(dto.responsibilities !== undefined
          ? { responsibilities: dto.responsibilities }
          : {}),
        ...(dto.benefits !== undefined ? { benefits: dto.benefits } : {}),
        ...(dto.salaryRange !== undefined
          ? { salaryRange: dto.salaryRange }
          : {}),
        ...(dto.status !== undefined
          ? { status: dto.status as CareerStatus }
          : {}),
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.career.delete({ where: { id } });
    return { deleted: true };
  }

  private async ensureExists(id: string) {
    const found = await this.prisma.career.count({ where: { id } });
    if (found === 0) throw new NotFoundException('Position not found');
  }

  // =====================================================
  // APPLICATIONS
  // =====================================================

  /**
   * PUBLIC — submit an application (with resume) to an OPEN role. The resume is
   * stored under an unguessable key; validation guards the file type and size.
   */
  async apply(
    careerId: string,
    dto: ApplyDto,
    resume: Express.Multer.File | undefined,
  ) {
    const career = await this.prisma.career.findFirst({
      where: { id: careerId, status: CareerStatus.OPEN },
      select: { id: true },
    });
    if (!career) throw new NotFoundException('This position is not open');

    if (!resume) throw new BadRequestException('A resume file is required');
    if (!RESUME_MIME_TYPES.includes(resume.mimetype)) {
      throw new BadRequestException('Resume must be a PDF or Word document');
    }
    if (resume.size > RESUME_MAX_BYTES) {
      throw new BadRequestException('Resume must be 5MB or smaller');
    }

    const resumeUrl = await this.storage.uploadFile(
      resume,
      'career-resumes/',
      randomUUID(),
    );

    await this.prisma.careerApplication.create({
      data: {
        careerId,
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone ?? null,
        resumeUrl,
        coverLetter: dto.coverLetter ?? null,
        linkedinUrl: dto.linkedinUrl ?? null,
        portfolioUrl: dto.portfolioUrl ?? null,
      },
    });

    // Nothing sensitive echoed back — just a receipt.
    return { submitted: true };
  }

  /** ADMIN — applications for one role, newest first, with the role title. */
  async listApplications(careerId: string) {
    await this.ensureExists(careerId);
    const [career, applications] = await Promise.all([
      this.prisma.career.findUnique({
        where: { id: careerId },
        select: { id: true, title: true },
      }),
      this.prisma.careerApplication.findMany({
        where: { careerId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { career, applications };
  }

  async updateApplicationStatus(id: string, status: ApplicationStatus) {
    await this.ensureApplicationExists(id);
    return this.prisma.careerApplication.update({
      where: { id },
      data: { status },
    });
  }

  async removeApplication(id: string) {
    await this.ensureApplicationExists(id);
    await this.prisma.careerApplication.delete({ where: { id } });
    return { deleted: true };
  }

  private async ensureApplicationExists(id: string) {
    const found = await this.prisma.careerApplication.count({ where: { id } });
    if (found === 0) throw new NotFoundException('Application not found');
  }
}
