import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilityConfigService } from '../auth/authorization/capability-config.service';
import { PlanConfigModule } from '../subscription/plan-config.module';
import { CertificateIssuanceQueue } from '../certificates/certificates.queue';
import { ReportsModule } from './reports.module';
import { ReportsService } from './reports.service';

/**
 * DI smoke test (B19): ReportsService takes the certificate worker queue, and
 * the queue's worker reaches back for ReportsService, so the two files import
 * each other. `.compile()` throws if that cycle leaves a provider undefined.
 */
describe('ReportsModule (DI graph)', () => {
  it('resolves ReportsService with the certificate queue', async () => {
    process.env.JWT_SECRET ??= 'test-secret';
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        EventEmitterModule.forRoot(),
        PlanConfigModule,
        ReportsModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(CapabilityConfigService)
      .useValue({ reload: jest.fn(), has: jest.fn(), effectiveHas: jest.fn() })
      // No Redis in tests: skip the queue's connections.
      .overrideProvider(CertificateIssuanceQueue)
      .useValue({ addReport: jest.fn() })
      .compile();

    expect(moduleRef.get(ReportsService)).toBeInstanceOf(ReportsService);
  });
});
