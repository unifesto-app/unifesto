import { ValidateBy, ValidationOptions } from 'class-validator';

/**
 * True only for an https URL on our own bucket's virtual-hosted endpoint
 * `<bucket>.s3.<region>.amazonaws.com` (what StorageService uploads return).
 * Guards server-side fetches of user-supplied URLs against SSRF (J11): no
 * internal IPs, metadata endpoints, other buckets or look-alike hosts.
 */
export function isOwnS3Url(url: string): boolean {
  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === `${bucket}.s3.${region}.amazonaws.com` &&
    !parsed.port &&
    !parsed.username &&
    !parsed.password
  );
}

/** DTO guard: the value must be an object URL in our own S3 bucket. */
export function IsOwnS3Url(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isOwnS3Url',
      validator: {
        validate: (value) => typeof value === 'string' && isOwnS3Url(value),
        defaultMessage: () => '$property must be an image uploaded to Unifesto',
      },
    },
    options,
  );
}
