import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PmController } from './pm.controller';
import { PmService } from './pm.service';
import { PmMcp } from './pm.mcp';

/** Product management board for Apex + an MCP endpoint for Claude. */
@Module({
  imports: [AuthModule],
  controllers: [PmController],
  providers: [PmService, PmMcp],
})
export class PmModule {}
