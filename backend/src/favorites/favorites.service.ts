import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NOT_DELETED } from '../common/soft-delete';

/**
 * Saved / favourited events. One row per (user, event), enforced by a unique
 * constraint so toggling is idempotent — adding an existing favourite is a
 * no-op, removing a missing one is a no-op.
 */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The event shape returned in favourite lists — matches the events list API. */
  private readonly eventInclude = {
    space: { select: { id: true, name: true, slug: true, logoUrl: true } },
    creator: {
      select: { id: true, fullName: true, username: true, avatarUrl: true },
    },
    // All visible+active ticket prices so a card can distinguish free / paid /
    // mixed (a lone cheapest ₹0 ticket made mixed events read "Free").
    ticketTypes: {
      where: { isVisible: true, isActive: true },
      select: { price: true, currency: true },
      orderBy: { price: 'asc' as const },
    },
    _count: { select: { registrations: true } },
  };

  /** Add an event to the user's favourites (idempotent). */
  async addFavorite(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    await this.prisma.favoriteEvent.upsert({
      where: { userId_eventId: { userId, eventId } },
      create: { userId, eventId },
      update: {},
    });
    return { eventId, favorited: true };
  }

  /** Remove an event from the user's favourites (idempotent). */
  async removeFavorite(userId: string, eventId: string) {
    await this.prisma.favoriteEvent.deleteMany({ where: { userId, eventId } });
    return { eventId, favorited: false };
  }

  /** The user's favourited events, newest first. */
  async getFavorites(userId: string) {
    const rows = await this.prisma.favoriteEvent.findMany({
      // A hidden event drops off the favourites list. The FavoriteEvent row
      // survives untouched, so restoring the event brings the heart back.
      where: { userId, event: NOT_DELETED },
      orderBy: { createdAt: 'desc' },
      include: { event: { include: this.eventInclude } },
    });
    // Unwrap to a plain list of events (the shape mobile event cards expect).
    return rows.map((r) => r.event);
  }

  /** Just the favourited event ids — lets the client mark hearts cheaply. */
  async getFavoriteIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.favoriteEvent.findMany({
      where: { userId, event: NOT_DELETED },
      select: { eventId: true },
    });
    return rows.map((r) => r.eventId);
  }
}
