import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadLimit } from '../common/upload-limits';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { CertificatesService } from './certificates.service';
import {
  CreateCertificateTemplateDto,
  ImportTemplateDto,
  IssueCertificatesDto,
  ResendCertificateEmailsDto,
  RevokeCertificateDto,
  UpdateCertificateTemplateDto,
} from './dto';

/**
 * Event-scoped certificate management — all organiser-only. Plan gating and
 * organiser membership are enforced in the service, per route.
 */
@Controller('events/:eventId/certificates')
export class EventCertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  /** Upload a background image for a template; returns its hosted URL. */
  @Post('background')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', uploadLimit(10)))
  uploadBackground(
    @CurrentUser() user: User,
    @Param('eventId') eventId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.certificates.uploadBackground(user.id, eventId, file);
  }

  /** Create a certificate template for this event. */
  @Post('templates')
  @UseGuards(JwtAuthGuard)
  createTemplate(
    @CurrentUser() user: User,
    @Param('eventId') eventId: string,
    @Body() dto: CreateCertificateTemplateDto,
  ) {
    return this.certificates.createTemplate(user.id, eventId, dto);
  }

  /** List this event's templates. */
  @Get('templates')
  @UseGuards(JwtAuthGuard)
  listTemplates(@CurrentUser() user: User, @Param('eventId') eventId: string) {
    return this.certificates.listTemplates(user.id, eventId);
  }

  /** Templates from OTHER events in the same space, for reuse. */
  @Get('templates/reusable')
  @UseGuards(JwtAuthGuard)
  listSpaceTemplates(
    @CurrentUser() user: User,
    @Param('eventId') eventId: string,
  ) {
    return this.certificates.listSpaceTemplates(user.id, eventId);
  }

  /** Copy a template from another event in this space into this event. */
  @Post('templates/import')
  @UseGuards(JwtAuthGuard)
  importTemplate(
    @CurrentUser() user: User,
    @Param('eventId') eventId: string,
    @Body() dto: ImportTemplateDto,
  ) {
    return this.certificates.importTemplate(
      user.id,
      eventId,
      dto.sourceTemplateId,
    );
  }

  /** Issue a batch of certificates from a template to the chosen audience. */
  @Post('issue')
  @UseGuards(JwtAuthGuard)
  issue(
    @CurrentUser() user: User,
    @Param('eventId') eventId: string,
    @Body() dto: IssueCertificatesDto,
  ) {
    return this.certificates.issue(user.id, eventId, dto);
  }

  /**
   * (Re)send certificate emails for this event. By default only certificates
   * that were never successfully emailed are sent; `includeAlreadySent` re-sends
   * to everyone with an email on file.
   */
  @Post('resend-emails')
  @UseGuards(JwtAuthGuard)
  resendEmails(
    @CurrentUser() user: User,
    @Param('eventId') eventId: string,
    @Body() dto: ResendCertificateEmailsDto,
  ) {
    return this.certificates.resendEmails(
      user.id,
      eventId,
      dto.includeAlreadySent ?? false,
    );
  }

  /**
   * Reissue every REVOKED certificate for this event: re-render each from its
   * template's latest design, bring it back to ISSUED (number + verify link
   * kept), and re-email the recipient. The "Reissue all" action on the Revoked
   * tab.
   */
  @Post('reissue-revoked')
  @UseGuards(JwtAuthGuard)
  reissueRevoked(
    @CurrentUser() user: User,
    @Param('eventId') eventId: string,
  ) {
    return this.certificates.reissueAllRevoked(user.id, eventId);
  }

  /** Poll the status of a queued issuance batch (returned by POST issue). */
  @Get('batches/:batchId')
  @UseGuards(JwtAuthGuard)
  getBatch(
    @CurrentUser() user: User,
    @Param('batchId') batchId: string,
  ) {
    return this.certificates.getBatch(user.id, batchId);
  }

  /**
   * The certificate-issuance window for this event: when it closes (event end +
   * the fixed grace period) and whether it's still open. The UI reads this to
   * show a deadline and disable "Issue" once closed.
   */
  @Get('issuance-window')
  @UseGuards(JwtAuthGuard)
  getIssuanceWindow(
    @CurrentUser() user: User,
    @Param('eventId') eventId: string,
  ) {
    return this.certificates.getIssuanceWindow(user.id, eventId);
  }

  /** List certificates issued for this event. */
  @Get()
  @UseGuards(JwtAuthGuard)
  listForEvent(@CurrentUser() user: User, @Param('eventId') eventId: string) {
    return this.certificates.listForEvent(user.id, eventId);
  }
}

/**
 * Flat certificate routes: template edits, revocation, the attendee's own list,
 * and the PUBLIC verification endpoint (no auth).
 *
 * Static segments are declared before parameterised ones so `mine`, `verify`
 * and `templates` are never swallowed by `:certificateId`.
 */
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  /** Attendee: my certificates across every event. */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: User) {
    return this.certificates.listMine(user.id);
  }

  /**
   * PUBLIC — verify a certificate by its code. No guard: anyone with the code
   * (e.g. from a résumé or QR) can confirm authenticity.
   */
  @Get('verify/:code')
  verify(@Param('code') code: string) {
    return this.certificates.verify(code);
  }

  /** Organiser: edit a template (name, background, fields, canvas). */
  @Patch('templates/:templateId')
  @UseGuards(JwtAuthGuard)
  updateTemplate(
    @CurrentUser() user: User,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateCertificateTemplateDto,
  ) {
    return this.certificates.updateTemplate(user.id, templateId, dto);
  }

  /** Organiser: delete an unused template. */
  @Delete('templates/:templateId')
  @UseGuards(JwtAuthGuard)
  deleteTemplate(
    @CurrentUser() user: User,
    @Param('templateId') templateId: string,
  ) {
    return this.certificates.deleteTemplate(user.id, templateId);
  }

  /** Organiser: revoke every issued certificate produced from one template. */
  @Post('templates/:templateId/revoke-all')
  @UseGuards(JwtAuthGuard)
  revokeAllForTemplate(
    @CurrentUser() user: User,
    @Param('templateId') templateId: string,
    @Body() dto: RevokeCertificateDto,
  ) {
    return this.certificates.revokeAllForTemplate(
      user.id,
      templateId,
      dto.reason,
    );
  }

  /**
   * Organiser: reissue a single revoked certificate — re-render it from its
   * template's latest design, restore it to ISSUED (keeping its number + verify
   * code), and re-email the recipient.
   */
  @Post(':certificateId/reissue')
  @UseGuards(JwtAuthGuard)
  reissue(
    @CurrentUser() user: User,
    @Param('certificateId') certificateId: string,
  ) {
    return this.certificates.reissue(user.id, certificateId);
  }

  /** Organiser: revoke an issued certificate. */
  @Post(':certificateId/revoke')
  @UseGuards(JwtAuthGuard)
  revoke(
    @CurrentUser() user: User,
    @Param('certificateId') certificateId: string,
    @Body() dto: RevokeCertificateDto,
  ) {
    return this.certificates.revoke(user.id, certificateId, dto.reason);
  }
}
