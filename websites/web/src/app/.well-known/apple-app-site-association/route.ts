import { NextResponse } from 'next/server';

/**
 * iOS Universal Links - Apple App Site Association
 * 
 * This endpoint serves the apple-app-site-association file required for iOS Universal Links.
 * It verifies domain ownership for the iOS app to handle deep links.
 * 
 * IMPORTANT: This route handler ensures the file is served with HTTP 200
 * instead of being redirected (HTTP 307) by Vercel domain settings.
 * 
 * Learn more: https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app
 */
export async function GET() {
  const appleAppSiteAssociation = {
    applinks: {
      apps: [],
      details: [
        {
          appID: '9AH3Z5C5DH.com.unifesto.app',
          paths: [
            '*'
          ],
          components: [
            {
              '/': '/event/*',
              comment: 'Matches all event detail pages'
            },
            {
              '/': '/space/*',
              comment: 'Matches all space detail pages'
            },
            {
              '/': '/claim/*',
              comment: 'Matches group-seat claim links (fast-registration)'
            },
            {
              '/': '/signup',
              comment: 'Matches signup app-open links'
            },
          ]
        }
      ]
    },
    // App Clip (mobile/targets/clip). Lets unifesto.app links, Safari's App
    // Clip card and QR / App Clip Codes open the native event preview.
    appclips: {
      apps: ['9AH3Z5C5DH.com.unifesto.app.Clip'],
    },
    webcredentials: {
      apps: [
        '9AH3Z5C5DH.com.unifesto.app'
      ]
    }
  };

  return NextResponse.json(appleAppSiteAssociation, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
}
