import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

/** I2: versioned legal documents and per-user acceptance. */
@Module({
  imports: [AuthModule],
  controllers: [LegalController],
  providers: [LegalService],
})
export class LegalModule {}
