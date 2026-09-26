import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilityConfigService } from '../auth/authorization/capability-config.service';
import { PlanConfigModule } from '../subscription/plan-config.module';
import { EmailCampaignsModule } from './email-campaigns.module';
import { EmailCampaignsService } from './email-campaigns.service';
import { EmailTemplatesService } from './email-templates.service';
import { SpaceEmailController } from './space-email.controller';
import { EmailTrackingController } from './email-tracking.controller';

/**
 * DI smoke test: compile the real EmailCampaignsModule graph (its imports pull
 * in AuthModule → CanGuard/JwtAuthGuard, EmailModule → EmailService). Prisma +
 * capability cache are stubbed so nothing touches a DB. If a provider or guard
 * dependency is mis-wired, `.compile()` throws — which is the whole point.
 */
describe('EmailCampaignsModule (DI graph)', () => {
  it('resolves the services and controllers', async () => {
    process.env.JWT_SECRET ??= 'test-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        // Global in AppModule; WhatsAppService emits on it.
        EventEmitterModule.forRoot(),
        // Global in AppModule; WhatsAppService reads the stats recipient list.
        PlanConfigModule,
        EmailCampaignsModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      // Skip the onModuleInit DB read; the guard only needs the instance.
      .overrideProvider(CapabilityConfigService)
      .useValue({ reload: jest.fn(), has: jest.fn(), effectiveHas: jest.fn() })
      .compile();

    expect(moduleRef.get(EmailCampaignsService)).toBeInstanceOf(EmailCampaignsService);
    expect(moduleRef.get(EmailTemplatesService)).toBeInstanceOf(EmailTemplatesService);
    expect(moduleRef.get(SpaceEmailController)).toBeInstanceOf(SpaceEmailController);
    expect(moduleRef.get(EmailTrackingController)).toBeInstanceOf(EmailTrackingController);
  });
});
