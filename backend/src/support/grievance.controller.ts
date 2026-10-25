import { Body, Controller, HttpCode, HttpStatus, Ip, NotFoundException, Post, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupportCaseKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from '../auth/otp.service';
import { findIdentityByEmail, normalizeEmail } from '../auth/identifiers';
import { SupportService } from './support.service';
import { CreateGrievanceDto } from './dto';

/**
 * D25: the public grievance page (IT Rules 2021). No sign-in: the person
 * proves the email with the code from POST /auth/email, and the grievance
 * opens a GRIEVANCE case on the Platform desk for that account, held to the
 * 24 hour / 15 day SLA (support-sla.ts).
 */
@ApiTags('Support')
@Controller('support/grievances')
export class GrievanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly support: SupportService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Raise a grievance (public, email code)' })
  async create(@Body() dto: CreateGrievanceDto, @Ip() ip: string) {
    // /auth/email stores the code under the lowercased address (J17).
    const result = await this.otp.verifyOtp(normalizeEmail(dto.email), dto.otp, ip);
    if (result === 'blocked') throw new UnauthorizedException('Too many failed attempts. Please try again in 15 minutes.');
    if (result !== 'ok') throw new UnauthorizedException('That code is wrong or has expired.');

    // The code proves the email, so an unverified identity with it counts; prefer a verified one.
    const identity = await findIdentityByEmail<{ userId: string }>(this.prisma, dto.email, {
      select: { userId: true },
      orderBy: [{ emailVerified: 'desc' }],
    });
    if (!identity) {
      throw new NotFoundException('No Unifesto account uses this email. Write to the Grievance Officer instead.');
    }

    const ticket = await this.support.createTicket(
      { kind: SupportCaseKind.GRIEVANCE, subject: dto.subject, message: dto.message, contactEmail: dto.email },
      identity.userId,
    );
    return { ticketNumber: ticket.ticketNumber };
  }
}
