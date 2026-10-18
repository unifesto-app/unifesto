import { Module } from '@nestjs/common';
import { AiService } from './ai.service';

/** Claude access for Assist (D13–D15) and Track M. See AiService. */
@Module({
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
