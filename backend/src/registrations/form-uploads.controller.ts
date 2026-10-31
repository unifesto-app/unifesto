import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { uploadLimit } from '../common/upload-limits';
import { FILE_MAX_MB_CAP } from './form-answers.util';
import { FormUploadsService } from './form-uploads.service';

/** Files attached to answers of FILE registration questions (4.0.0 item 0.9). */
@Controller('events')
@UseGuards(JwtAuthGuard)
export class FormUploadsController {
  constructor(private readonly uploads: FormUploadsService) {}

  @Post(':id/form-fields/:fieldId/upload')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', uploadLimit(FILE_MAX_MB_CAP)))
  upload(
    @Request() req,
    @Param('id') eventId: string,
    @Param('fieldId') fieldId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.uploads.upload(req.user.id, eventId, fieldId, file);
  }

  @Get(':id/form-uploads/url')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  viewUrl(
    @Request() req,
    @Param('id') eventId: string,
    @Query('key') key: string,
  ) {
    return this.uploads.viewUrl(req.user.id, eventId, key);
  }
}
