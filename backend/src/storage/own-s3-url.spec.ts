import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { isOwnS3Url } from './own-s3-url';
import { CreateCertificateTemplateDto } from '../certificates/dto';
import { CertificateRenderService } from '../certificates/certificate-render.service';

describe('isOwnS3Url (J11 SSRF guard)', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.S3_BUCKET_NAME = 'unifesto-bucket';
    process.env.AWS_REGION = 'ap-south-1';
  });
  afterAll(() => {
    process.env = env;
  });

  const OWN =
    'https://unifesto-bucket.s3.ap-south-1.amazonaws.com/certificate-backgrounds/a.png';

  it('accepts an object in our bucket', () => {
    expect(isOwnS3Url(OWN)).toBe(true);
  });

  it.each([
    'http://unifesto-bucket.s3.ap-south-1.amazonaws.com/a.png', // not https
    'https://169.254.169.254/latest/meta-data/', // instance metadata
    'https://localhost/a.png',
    'https://10.0.0.5/a.png',
    'https://other-bucket.s3.ap-south-1.amazonaws.com/a.png',
    'https://unifesto-bucket.s3.ap-south-1.amazonaws.com.evil.example/a.png',
    'https://evil.example/unifesto-bucket.s3.ap-south-1.amazonaws.com/a.png',
    'https://unifesto-bucket.s3.ap-south-1.amazonaws.com:8443/a.png',
    'https://user:pw@unifesto-bucket.s3.ap-south-1.amazonaws.com/a.png',
    'not a url',
  ])('rejects %s', (url) => {
    expect(isOwnS3Url(url)).toBe(false);
  });

  it('fails closed when the bucket is not configured', () => {
    delete process.env.S3_BUCKET_NAME;
    expect(isOwnS3Url(OWN)).toBe(false);
  });

  it('is enforced on the certificate template DTO', () => {
    const dto = (backgroundUrl: string) =>
      plainToInstance(CreateCertificateTemplateDto, {
        name: 'T',
        backgroundUrl,
        canvasWidth: 2000,
        canvasHeight: 1414,
        fields: [{ key: 'recipientName', x: 1, y: 1, fontSize: 20 }],
      });
    const errs = (url: string) =>
      validateSync(dto(url)).filter((e) => e.property === 'backgroundUrl');
    expect(errs(OWN)).toHaveLength(0);
    expect(errs('http://169.254.169.254/latest/meta-data/')).toHaveLength(1);
  });

  it('is re-checked before the render fetch (rows saved before the DTO guard)', async () => {
    const render = new CertificateRenderService();
    await expect(
      (render as any).fetchBackground(
        'http://169.254.169.254/latest/meta-data/',
      ),
    ).rejects.toThrow('uploaded to Unifesto');
  });
});
