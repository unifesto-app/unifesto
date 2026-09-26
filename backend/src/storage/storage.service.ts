import {
  Injectable,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';

/**
 * Keys are timestamped and never overwritten, so an object's bytes never
 * change: phones and browsers may keep it for a year without revalidating.
 */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Longest edge kept for uploaded images; phone originals are 4000px+. */
export const MAX_IMAGE_EDGE = 1600;

/**
 * Prefixes whose images are stored as uploaded. Certificate backgrounds are
 * drawn at the template's canvas size (often print-resolution A4), so a
 * downscale would blur every issued certificate.
 */
export const FULL_RES_PREFIXES = ['certificate-backgrounds/'];

/**
 * Downscale and recompress a raster image in its own format (so the key's
 * extension and Content-Type stay true). Anything sharp can't read, or a
 * result that isn't smaller, falls back to the original bytes.
 */
export async function optimizeImage(
  buffer: Buffer,
  mimeType: string,
  logger?: Pick<Logger, 'warn'>,
): Promise<Buffer> {
  const encoders: Record<string, (img: sharp.Sharp) => sharp.Sharp> = {
    'image/jpeg': (img) => img.jpeg({ quality: 80, mozjpeg: true }),
    'image/png': (img) => img.png({ compressionLevel: 9 }),
    'image/webp': (img) => img.webp({ quality: 80 }),
  };
  const encode = encoders[mimeType];
  if (!encode) return buffer;
  try {
    const out = await encode(
      sharp(buffer)
        .rotate() // bake in EXIF orientation before metadata is stripped
        .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: 'inside', withoutEnlargement: true }),
    ).toBuffer();
    return out.length < buffer.length ? out : buffer;
  } catch (error) {
    logger?.warn(`Image optimisation skipped (${mimeType}): ${error}`);
    return buffer;
  }
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;

  constructor(private configService: ConfigService) {
    // Get AWS configuration from environment variables
    this.region = this.configService.get<string>('AWS_REGION') || '';
    this.bucketName = this.configService.get<string>('S3_BUCKET_NAME') || '';

    // Initialize S3 Client with IAM role credentials (no hardcoded keys)
    this.s3Client = new S3Client({
      region: this.region,
      // Credentials automatically obtained from EC2 instance profile
    });
  }

  onModuleInit() {
    this.logger.log(
      `StorageService initialized with bucket: ${this.bucketName}, region: ${this.region}`,
    );
  }

  /**
   * Upload a file to S3 with specified key prefix
   * @param file - Multer file object
   * @param prefix - S3 key prefix (e.g., 'avatars/', 'space-logos/', 'space-banners/')
   * @param identifier - Unique identifier for the file (e.g., userId, spaceId)
   * @returns Public URL of uploaded file
   * @throws ConflictException if upload fails
   */
  async uploadFile(
    file: Express.Multer.File,
    prefix: string,
    identifier: string,
  ): Promise<string> {
    try {
      // Generate timestamped filename: {identifier}-{timestamp}.{extension}
      const timestamp = Date.now();
      const extension = file.originalname.split('.').pop();
      const key = `${prefix}${identifier}-${timestamp}.${extension}`;

      this.logger.log(
        `Uploading file to S3: bucket=${this.bucketName}, key=${key}, size=${file.size}, mimeType=${file.mimetype}`,
      );

      // Create PutObject command with appropriate headers
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: FULL_RES_PREFIXES.includes(prefix)
          ? file.buffer
          : await optimizeImage(file.buffer, file.mimetype, this.logger),
        ContentType: file.mimetype, // Set Content-Type header based on MIME type
        CacheControl: IMMUTABLE_CACHE_CONTROL,
      });

      // Execute S3 upload
      await this.s3Client.send(command);

      // Generate S3 public URL
      const s3Url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;

      this.logger.log(`Successfully uploaded file to S3: ${s3Url}`);

      return s3Url;
    } catch (error) {
      this.logger.error('S3 upload failed', {
        bucket: this.bucketName,
        prefix,
        identifier,
        fileSize: file.size,
        mimeType: file.mimetype,
        error: error.message,
      });

      throw new ConflictException(
        `Failed to upload file: ${error.message || 'S3 error'}`,
      );
    }
  }

  /**
   * Upload an in-memory buffer (e.g. a rendered certificate PDF/PNG) to S3.
   * Unlike {@link uploadFile}, the caller supplies the full key and content
   * type directly — used when the bytes are generated server-side rather than
   * received as a Multer upload.
   *
   * @param buffer - The file contents.
   * @param key - Full S3 key, e.g. 'certificates/<id>.pdf'.
   * @param contentType - MIME type, e.g. 'application/pdf' or 'image/png'.
   * @returns Public URL of the uploaded object.
   * @throws ConflictException if the upload fails.
   */
  /**
   * Delete an object by key. Best-effort: logs on failure rather than throwing,
   * since callers (e.g. cleaning up a replaced upload) must not fail
   * the surrounding request if the delete itself errors.
   */
  async deleteObject(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
      this.logger.log(`Deleted S3 object: key=${key}`);
    } catch (error) {
      this.logger.error(`S3 delete failed for key=${key}: ${error.message}`);
    }
  }

  async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<string> {
    try {
      this.logger.log(
        `Uploading buffer to S3: bucket=${this.bucketName}, key=${key}, size=${buffer.length}, contentType=${contentType}`,
      );

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await this.s3Client.send(command);

      const s3Url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
      this.logger.log(`Successfully uploaded buffer to S3: ${s3Url}`);
      return s3Url;
    } catch (error) {
      this.logger.error('S3 buffer upload failed', {
        bucket: this.bucketName,
        key,
        size: buffer.length,
        contentType,
        error: error.message,
      });

      throw new ConflictException(
        `Failed to upload file: ${error.message || 'S3 error'}`,
      );
    }
  }
}
