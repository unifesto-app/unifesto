import { BannerPaletteService } from './banner-palette.service';

/** J1: the server only ever fetches banners from our own bucket. */
describe('BannerPaletteService.forUrl', () => {
  const env = { ...process.env };
  beforeAll(() => Object.assign(process.env, { S3_BUCKET_NAME: 'unifesto-storage-bucket', AWS_REGION: 'ap-south-1' }));
  afterAll(() => (process.env = env));

  it('never fetches another bucket, an EC2 host or plain http', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const svc = new BannerPaletteService();
    for (const url of [
      'https://attacker-bucket.s3.ap-south-1.amazonaws.com/x.png',
      'https://ec2-1-2-3-4.ap-south-1.compute.amazonaws.com/x.png',
      'http://unifesto-storage-bucket.s3.ap-south-1.amazonaws.com/x.png',
      'not a url',
    ]) {
      expect(await svc.forUrl(url)).toEqual([]);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('still fetches our own bucket', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    await new BannerPaletteService().forUrl('https://unifesto-storage-bucket.s3.ap-south-1.amazonaws.com/space-banners/a.png');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });
});
