import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { BroadcastCheck } from './broadcast-check';
import { RiskScreen } from './risk-screen.service';

/** Claude access for Assist (D13–D15), Track M, and the AI3/AI19 safety checks. See AiService. */
@Module({
  providers: [AiService, RiskScreen, BroadcastCheck],
  exports: [AiService, BroadcastCheck],
})
export class AiModule {}
