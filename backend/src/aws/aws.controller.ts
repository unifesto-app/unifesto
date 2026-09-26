import { 
  Controller, 
  Get, 
  Post, 
  Delete, 
  Body, 
  Query, 
  Param, 
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadLimit } from '../common/upload-limits';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AwsService } from './aws.service';
import { 
  GetPresignedUrlDto, 
  RenameFileDto, 
  DeleteFileDto,
  StorageFolder,
} from './dto';

@Controller('aws')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AwsController {
  constructor(private readonly awsService: AwsService) {}

  @Get('health')
  async getHealth() {
    return this.awsService.getInfrastructureHealth();
  }

  @Get('overview')
  async getOverview() {
    return this.awsService.getOverview();
  }

  @Get('compute')
  async getCompute() {
    return this.awsService.getCompute();
  }

  @Get('database')
  async getDatabase() {
    return this.awsService.getDatabase();
  }

  @Get('database/table/:tableName')
  async getTableDetails(@Param('tableName') tableName: string) {
    return this.awsService.getTableDetails(tableName);
  }

  @Get('cache')
  async getCache() {
    return this.awsService.getCache();
  }

  @Get('storage')
  async getStorage() {
    return this.awsService.getStorage();
  }

  @Get('security')
  async getSecurity() {
    return this.awsService.getSecurity();
  }

  @Get('cost')
  async getCost() {
    return this.awsService.getCost();
  }

  @Get('ses')
  async getSES() {
    return this.awsService.getSES();
  }

  // =====================================================
  // STORAGE FILE MANAGEMENT
  // =====================================================

  @Get('storage/folders/:folder/files')
  async listFiles(@Param('folder') folder: StorageFolder) {
    return this.awsService.listFiles(folder);
  }

  @Get('storage/folders/:folder/files/:fileName')
  async getFileDetails(
    @Param('folder') folder: StorageFolder,
    @Param('fileName') fileName: string,
  ) {
    return this.awsService.getFileDetails(folder, fileName);
  }

  @Post('storage/upload-url')
  async getUploadUrl(@Body() dto: GetPresignedUrlDto) {
    return this.awsService.getUploadUrl(
      dto.folder,
      dto.fileName,
      dto.contentType,
    );
  }

  @Post('storage/download-url')
  async getDownloadUrl(
    @Body() body: { folder: StorageFolder; fileName: string },
  ) {
    return this.awsService.getDownloadUrl(body.folder, body.fileName);
  }

  @Post('storage/upload')
  @UseInterceptors(FileInterceptor('file', uploadLimit(50)))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder: StorageFolder,
    @Body('fileName') fileName?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const finalFileName = fileName || file.originalname;
    return this.awsService.uploadFile(
      folder,
      finalFileName,
      file.buffer,
      file.mimetype,
    );
  }

  @Post('storage/rename')
  async renameFile(@Body() dto: RenameFileDto) {
    return this.awsService.renameFile(
      dto.folder,
      dto.oldFileName,
      dto.newFileName,
    );
  }

  @Delete('storage/delete')
  async deleteFile(@Body() dto: DeleteFileDto) {
    return this.awsService.deleteFile(dto.folder, dto.fileName);
  }

  @Delete('storage/delete-multiple')
  async deleteFiles(
    @Body() body: { folder: StorageFolder; fileNames: string[] },
  ) {
    if (!body.fileNames || body.fileNames.length === 0) {
      throw new BadRequestException('No files specified for deletion');
    }
    return this.awsService.deleteFiles(body.folder, body.fileNames);
  }
}
