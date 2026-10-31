/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { StorageService, sniffImage } from './storage.service';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn();
  const mockS3Client = jest.fn(() => ({
    send: mockSend,
  }));

  return {
    S3Client: mockS3Client,
    PutObjectCommand: jest.fn(),
  };
});

// Real file signatures: uploadFile types an upload by its bytes (J15).
const JPEG = (body = 'test file content') => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(body)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png body')]);
const WEBP = Buffer.from('RIFF\0\0\0\0WEBPVP8 body', 'latin1');

describe('sniffImage (J15)', () => {
  it('tells JPG, PNG, WebP and ICO apart by their first bytes', () => {
    expect(sniffImage(JPEG())?.mime).toBe('image/jpeg');
    expect(sniffImage(PNG)?.mime).toBe('image/png');
    expect(sniffImage(WEBP)?.mime).toBe('image/webp');
    expect(sniffImage(Buffer.from([0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0]))?.mime).toBe('image/x-icon');
  });

  it('rejects HTML, SVG, PDF and short buffers', () => {
    for (const body of ['<html><script>alert(1)</script>', '<svg xmlns="http://www.w3.org/2000/svg"/>', '%PDF-1.7 ...', 'GIF']) {
      expect(sniffImage(Buffer.from(body))).toBeNull();
    }
  });
});

describe('StorageService', () => {
  let service: StorageService;
  let configService: ConfigService;
  let s3Client: any;
  let loggerLogSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        AWS_REGION: 'ap-south-1',
        S3_BUCKET_NAME: 'test-bucket',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
    configService = module.get<ConfigService>(ConfigService);

    // Get the mocked S3Client instance
    s3Client = (service as any).s3Client as any;

    // Spy on logger methods
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor', () => {
    it('should initialize with correct AWS configuration', () => {
      expect(configService.get).toHaveBeenCalledWith('AWS_REGION');
      expect(configService.get).toHaveBeenCalledWith('S3_BUCKET_NAME');
      expect((service as any).region).toBe('ap-south-1');
      expect((service as any).bucketName).toBe('test-bucket');
    });

    it('should initialize S3Client with correct region', () => {
      expect(S3Client).toHaveBeenCalledWith({
        region: 'ap-south-1',
        // S32: a hung S3 call must not hold the request forever.
        requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 },
      });
    });

    it('should initialize S3Client without hardcoded credentials', () => {
      expect(S3Client).toHaveBeenCalledWith(
        expect.not.objectContaining({
          credentials: expect.anything(),
        }),
      );
    });
  });

  describe('onModuleInit', () => {
    it('should log initialization message with bucket and region', () => {
      service.onModuleInit();

      expect(loggerLogSpy).toHaveBeenCalledWith(
        'StorageService initialized with bucket: test-bucket, region: ap-south-1',
      );
    });
  });

  describe('uploadFile', () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'test-image.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: JPEG(),
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };

    const prefix = 'avatars/';
    const identifier = 'user-123';

    beforeEach(() => {
      // Mock Date.now() to return a consistent timestamp
      jest.spyOn(Date, 'now').mockReturnValue(1234567890);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should successfully upload file to S3 and return public URL', async () => {
      // Mock successful S3 upload
      s3Client.send.mockResolvedValue({});

      const result = await service.uploadFile(mockFile, prefix, identifier);

      // Verify PutObjectCommand was called with correct parameters
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'avatars/user-123-1234567890.jpg',
        Body: mockFile.buffer,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      });

      // Verify S3 client send was called
      expect(s3Client.send).toHaveBeenCalledTimes(1);

      // Verify returned URL format
      expect(result).toBe(
        'https://test-bucket.s3.ap-south-1.amazonaws.com/avatars/user-123-1234567890.jpg',
      );

      // Verify logging
      expect(loggerLogSpy).toHaveBeenCalledWith(
        'Uploading file to S3: bucket=test-bucket, key=avatars/user-123-1234567890.jpg, size=1024, mimeType=image/jpeg',
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        'Successfully uploaded file to S3: https://test-bucket.s3.ap-south-1.amazonaws.com/avatars/user-123-1234567890.jpg',
      );
    });

    it('should generate correct file key with timestamp', async () => {
      s3Client.send.mockResolvedValue({});

      await service.uploadFile(mockFile, prefix, identifier);

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'avatars/user-123-1234567890.jpg',
        }),
      );
    });

    it('should set correct Content-Type header based on MIME type', async () => {
      s3Client.send.mockResolvedValue({});

      const pngFile = {
        ...mockFile,
        originalname: 'test-image.png',
        mimetype: 'image/png',
        buffer: PNG,
      };

      await service.uploadFile(pngFile, prefix, identifier);

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'image/png',
        }),
      );
    });

    it('should handle different file extensions correctly', async () => {
      s3Client.send.mockResolvedValue({});

      const webpFile = {
        ...mockFile,
        originalname: 'test-image.webp',
        mimetype: 'image/webp',
        buffer: WEBP,
      };

      await service.uploadFile(webpFile, 'space-logos/', 'space-456');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'space-logos/space-456-1234567890.webp',
        }),
      );
    });

    it('should handle files with multiple dots in filename', async () => {
      s3Client.send.mockResolvedValue({});

      const complexFile = {
        ...mockFile,
        originalname: 'my.test.image.jpg',
      };

      await service.uploadFile(complexFile, prefix, identifier);

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'avatars/user-123-1234567890.jpg',
        }),
      );
    });

    it('should work with different prefixes', async () => {
      s3Client.send.mockResolvedValue({});

      // Test space-logos prefix
      await service.uploadFile(mockFile, 'space-logos/', 'space-789');
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'space-logos/space-789-1234567890.jpg',
        }),
      );

      // Test space-banners prefix
      await service.uploadFile(mockFile, 'space-banners/', 'space-101');
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'space-banners/space-101-1234567890.jpg',
        }),
      );
    });

    it('should throw ConflictException when S3 upload fails', async () => {
      // Mock S3 upload failure
      const s3Error = new Error('S3 service unavailable');
      s3Client.send.mockRejectedValue(s3Error);

      await expect(
        service.uploadFile(mockFile, prefix, identifier),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.uploadFile(mockFile, prefix, identifier),
      ).rejects.toThrow('Failed to upload file: S3 service unavailable');
    });

    it('should log error details when upload fails', async () => {
      const s3Error = new Error('Access denied');
      s3Client.send.mockRejectedValue(s3Error);

      await expect(
        service.uploadFile(mockFile, prefix, identifier),
      ).rejects.toThrow(ConflictException);

      expect(loggerErrorSpy).toHaveBeenCalledWith('S3 upload failed', {
        bucket: 'test-bucket',
        prefix: 'avatars/',
        identifier: 'user-123',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        error: 'Access denied',
      });
    });

    it('should handle S3 error without message', async () => {
      const s3Error = new Error();
      s3Error.message = '';
      s3Client.send.mockRejectedValue(s3Error);

      await expect(
        service.uploadFile(mockFile, prefix, identifier),
      ).rejects.toThrow('Failed to upload file: S3 error');
    });

    it('should handle S3 error with null message', async () => {
      const s3Error = { message: null };
      s3Client.send.mockRejectedValue(s3Error);

      await expect(
        service.uploadFile(mockFile, prefix, identifier),
      ).rejects.toThrow('Failed to upload file: S3 error');
    });

    it('should include file buffer in S3 upload command', async () => {
      s3Client.send.mockResolvedValue({});

      const fileWithBuffer = {
        ...mockFile,
        buffer: JPEG('specific test content'),
      };

      await service.uploadFile(fileWithBuffer, prefix, identifier);

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Body: fileWithBuffer.buffer,
        }),
      );
    });

    it('types and names the file by its bytes, not the client (J15)', async () => {
      s3Client.send.mockResolvedValue({});

      // PNG bytes sent as "photo.jpg" / image/jpeg are stored as a PNG.
      await service.uploadFile({ ...mockFile, buffer: PNG }, prefix, identifier);

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Key: 'avatars/user-123-1234567890.png', ContentType: 'image/png' }),
      );
    });

    it('refuses anything that is not an image before touching S3 (J15)', async () => {
      const html = { ...mockFile, originalname: 'x.png', mimetype: 'image/png', buffer: Buffer.from('<html><script>alert(1)</script></html>') };

      await expect(service.uploadFile(html, prefix, identifier)).rejects.toThrow(BadRequestException);
      expect(s3Client.send).not.toHaveBeenCalled();
    });

    it('should handle large files', async () => {
      s3Client.send.mockResolvedValue({});

      const largeFile = {
        ...mockFile,
        size: 10485760, // 10MB
        buffer: Buffer.concat([JPEG(), Buffer.alloc(10485760)]),
      };

      const result = await service.uploadFile(largeFile, prefix, identifier);

      expect(result).toBeDefined();
      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('size=10485760'),
      );
    });
  });

  describe('S3 URL generation', () => {
    it('should generate correct S3 public URL format', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: JPEG('test image'),
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      jest.spyOn(Date, 'now').mockReturnValue(9876543210);
      (service as any).s3Client.send = jest.fn().mockResolvedValue({});

      const result = await service.uploadFile(mockFile, 'avatars/', 'user-999');

      // Verify URL follows the pattern: https://{bucket}.s3.{region}.amazonaws.com/{key}
      expect(result).toBe(
        'https://test-bucket.s3.ap-south-1.amazonaws.com/avatars/user-999-9876543210.jpg',
      );
    });
  });

  describe('IAM role authentication', () => {
    it('should not include hardcoded AWS credentials in S3Client initialization', () => {
      // Verify S3Client was called without credentials property
      const s3ClientCalls = (S3Client as jest.Mock).mock.calls;
      const lastCall = s3ClientCalls[s3ClientCalls.length - 1];

      expect(lastCall[0]).not.toHaveProperty('credentials');
      expect(lastCall[0]).not.toHaveProperty('accessKeyId');
      expect(lastCall[0]).not.toHaveProperty('secretAccessKey');
    });
  });

  describe('configuration edge cases', () => {
    it('should handle missing AWS_REGION configuration', async () => {
      const mockConfigServiceNoRegion = {
        get: jest.fn((key: string) => {
          if (key === 'S3_BUCKET_NAME') return 'test-bucket';
          return '';
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: ConfigService,
            useValue: mockConfigServiceNoRegion,
          },
        ],
      }).compile();

      const serviceNoRegion = module.get<StorageService>(StorageService);
      expect((serviceNoRegion as any).region).toBe('');
    });

    it('should handle missing S3_BUCKET_NAME configuration', async () => {
      const mockConfigServiceNoBucket = {
        get: jest.fn((key: string) => {
          if (key === 'AWS_REGION') return 'ap-south-1';
          return '';
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: ConfigService,
            useValue: mockConfigServiceNoBucket,
          },
        ],
      }).compile();

      const serviceNoBucket = module.get<StorageService>(StorageService);
      expect((serviceNoBucket as any).bucketName).toBe('');
    });
  });
});
