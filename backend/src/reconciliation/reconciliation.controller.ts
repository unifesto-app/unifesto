import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleCode } from '@prisma/client';

/**
 * Admin-only reconciliation reads. Every route lines the platform ledger up
 * against Razorpay for a `from`/`to` window (ISO dates or timestamps; defaults
 * to the last 30 days). Data is fetched live from Razorpay — no cron, no mirror.
 */
@Controller('admin/reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  /** Headline totals: platform vs Razorpay vs settled-to-bank, with diffs. */
  @Get('summary')
  getSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reconciliation.getSummary(from, to);
  }

  /** Money still held at Razorpay (all-time captured − fees − refunds − settled). */
  @Get('balance')
  getBalance() {
    return this.reconciliation.getBalance();
  }

  /** Line-by-line payment match (Razorpay ↔ platform), with mismatch flags. */
  @Get('payments')
  getPayments(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reconciliation.getPayments(from, to);
  }

  /**
   * Captured payments not reflected as PAID, classified and given a one-click
   * attach target: ORPHANED (notes registration gone → re-home) or UNSETTLED
   * (notes registration still PENDING → reconcile in place). Powers the
   * Orphaned Payments admin view.
   */
  @Get('orphaned')
  getOrphaned(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reconciliation.getOrphanedPayments(from, to);
  }

  /** Razorpay refunds matched to platform refund requests. */
  @Get('refunds')
  getRefunds(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reconciliation.getRefunds(from, to);
  }

  /** Razorpay settlements deposited to the platform bank (money received). */
  @Get('settlements')
  getSettlements(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reconciliation.getSettlements(from, to);
  }
}
