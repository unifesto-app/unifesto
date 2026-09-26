import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { EmailModule } from '../email/email.module';
import {
  CertificatesController,
  EventCertificatesController,
} from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { CertificateRenderService } from './certificate-render.service';
import { CertificateIssuanceQueue } from './certificates.queue';

/**
 * Certificate system: organiser-designed templates, batch issuance of
 * PDF + PNG certificates, and a public verification endpoint.
 *
 * PrismaModule and PlanConfigModule are @Global; StorageModule is imported for
 * S3 uploads, AuthModule for the JwtAuthGuard on the organiser/attendee
 * routes (the verify route is intentionally unguarded), and EmailModule so
 * issuance can email each recipient a link to their certificate.
 */
@Module({
  imports: [AuthModule, StorageModule, EmailModule],
  controllers: [CertificatesController, EventCertificatesController],
  providers: [
    CertificatesService,
    CertificateRenderService,
    CertificateIssuanceQueue,
  ],
  exports: [CertificatesService],
})
export class CertificatesModule {}
