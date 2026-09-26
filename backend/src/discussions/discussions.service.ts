import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanViewSpace } from '../spaces/space-access';
import {
  CreateDiscussionDto,
  CreateReplyDto,
  UpdateDiscussionDto,
} from './dto';

@Injectable()
export class DiscussionsService {
  private readonly logger = new Logger(DiscussionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all discussions for a space
   */
  async getDiscussionsBySpace(
    spaceId: string,
    params: {
      page?: number;
      limit?: number;
      pinned?: boolean;
    },
    viewerId?: string,
  ) {
    await assertCanViewSpace(this.prisma, spaceId, viewerId);
    const { page = 1, limit = 20, pinned } = params;
    const skip = (page - 1) * limit;

    const where: any = {
      spaceId,
      isDeleted: false,
    };

    if (pinned !== undefined) {
      where.isPinned = pinned;
    }

    const [discussions, total] = await Promise.all([
      this.prisma.discussion.findMany({
        where,
        skip,
        take: limit,
        include: {
          author: {
            select: {
              id: true,
              fullName: true,
              username: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: {
              replies: {
                where: { isDeleted: false },
              },
            },
          },
        },
        orderBy: [{ isPinned: 'desc' }, { lastActivityAt: 'desc' }],
      }),
      this.prisma.discussion.count({ where }),
    ]);

    return {
      discussions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get discussion by ID with replies
   */
  async getDiscussionById(id: string, viewerId?: string) {
    const discussion = await this.prisma.discussion.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            username: true,
            avatarUrl: true,
          },
        },
        space: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        replies: {
          where: { isDeleted: false },
          include: {
            author: {
              select: {
                id: true,
                fullName: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!discussion || discussion.isDeleted) {
      throw new NotFoundException('Discussion not found');
    }
    // 404 like a missing discussion when its private space is off-limits.
    await assertCanViewSpace(this.prisma, discussion.spaceId, viewerId).catch(() => {
      throw new NotFoundException('Discussion not found');
    });

    // Increment view count
    await this.prisma.discussion.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return discussion;
  }

  /**
   * Create a new discussion
   */
  async createDiscussion(dto: CreateDiscussionDto, authorId: string) {
    // Verify space exists
    const space = await this.prisma.space.findUnique({
      where: { id: dto.spaceId },
    });

    if (!space) {
      throw new NotFoundException('Space not found');
    }
    await assertCanViewSpace(this.prisma, space, authorId);

    const discussion = await this.prisma.discussion.create({
      data: {
        title: dto.title,
        content: dto.content,
        spaceId: dto.spaceId,
        authorId,
      },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    return discussion;
  }

  /**
   * Update discussion
   */
  async updateDiscussion(
    id: string,
    dto: UpdateDiscussionDto,
    userId: string,
  ) {
    const discussion = await this.prisma.discussion.findUnique({
      where: { id },
    });

    if (!discussion || discussion.isDeleted) {
      throw new NotFoundException('Discussion not found');
    }

    // Only author can update content/title
    if (
      (dto.title || dto.content) &&
      discussion.authorId !== userId
    ) {
      throw new ForbiddenException(
        'Only the author can update discussion content',
      );
    }

    const updatedDiscussion = await this.prisma.discussion.update({
      where: { id },
      data: {
        ...dto,
        updatedAt: new Date(),
      },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    return updatedDiscussion;
  }

  /**
   * Delete discussion (soft delete)
   */
  async deleteDiscussion(id: string, userId: string) {
    const discussion = await this.prisma.discussion.findUnique({
      where: { id },
    });

    if (!discussion || discussion.isDeleted) {
      throw new NotFoundException('Discussion not found');
    }

    // Only author can delete
    if (discussion.authorId !== userId) {
      throw new ForbiddenException('Only the author can delete this discussion');
    }

    await this.prisma.discussion.update({
      where: { id },
      data: { isDeleted: true },
    });

    return { message: 'Discussion deleted successfully' };
  }

  /**
   * Pin/Unpin discussion
   */
  async togglePin(id: string, isPinned: boolean) {
    const discussion = await this.prisma.discussion.findUnique({
      where: { id },
    });

    if (!discussion || discussion.isDeleted) {
      throw new NotFoundException('Discussion not found');
    }

    const updated = await this.prisma.discussion.update({
      where: { id },
      data: { isPinned },
    });

    return updated;
  }

  /**
   * Lock/Unlock discussion
   */
  async toggleLock(id: string, isLocked: boolean) {
    const discussion = await this.prisma.discussion.findUnique({
      where: { id },
    });

    if (!discussion || discussion.isDeleted) {
      throw new NotFoundException('Discussion not found');
    }

    const updated = await this.prisma.discussion.update({
      where: { id },
      data: { isLocked },
    });

    return updated;
  }

  /**
   * Create a reply to discussion
   */
  async createReply(dto: CreateReplyDto, authorId: string) {
    const discussion = await this.prisma.discussion.findUnique({
      where: { id: dto.discussionId },
    });

    if (!discussion || discussion.isDeleted) {
      throw new NotFoundException('Discussion not found');
    }
    await assertCanViewSpace(this.prisma, discussion.spaceId, authorId);

    if (discussion.isLocked) {
      throw new ForbiddenException('Discussion is locked');
    }

    const reply = await this.prisma.discussionReply.create({
      data: {
        content: dto.content,
        discussionId: dto.discussionId,
        authorId,
      },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Update discussion reply count and last activity
    await this.prisma.discussion.update({
      where: { id: dto.discussionId },
      data: {
        replyCount: { increment: 1 },
        lastActivityAt: new Date(),
      },
    });

    return reply;
  }

  /**
   * Delete reply (soft delete)
   */
  async deleteReply(id: string, userId: string) {
    const reply = await this.prisma.discussionReply.findUnique({
      where: { id },
      include: { discussion: true },
    });

    if (!reply || reply.isDeleted) {
      throw new NotFoundException('Reply not found');
    }

    // Only author can delete
    if (reply.authorId !== userId) {
      throw new ForbiddenException('Only the author can delete this reply');
    }

    await this.prisma.discussionReply.update({
      where: { id },
      data: { isDeleted: true },
    });

    // Decrement reply count
    await this.prisma.discussion.update({
      where: { id: reply.discussionId },
      data: {
        replyCount: { decrement: 1 },
      },
    });

    return { message: 'Reply deleted successfully' };
  }
}
