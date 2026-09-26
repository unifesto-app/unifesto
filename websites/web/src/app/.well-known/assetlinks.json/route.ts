import { NextResponse } from 'next/server';

/**
 * Android App Links - Digital Asset Links
 * 
 * This endpoint serves the assetlinks.json file required for Android App Links.
 * It verifies domain ownership for the Android app to handle deep links.
 * 
 * IMPORTANT: This route handler ensures the file is served with HTTP 200
 * instead of being redirected (HTTP 307) by Vercel domain settings.
 * 
 * Learn more: https://developer.android.com/training/app-links/verify-android-applinks
 */
export async function GET() {
  const assetLinks = [
    {
      relation: [
        'delegate_permission/common.handle_all_urls',
        'delegate_permission/common.get_login_creds'
      ],
      target: {
        namespace: 'android_app',
        package_name: 'com.unifesto.app',
        sha256_cert_fingerprints: [
          '31:BD:17:72:30:3E:61:0B:29:12:07:57:23:FF:96:41:5A:5C:7A:0C:A9:4B:AB:EB:97:E9:5E:A5:86:3F:EE:E1',
        ],
      },
    },
  ];

  return NextResponse.json(assetLinks, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
}
