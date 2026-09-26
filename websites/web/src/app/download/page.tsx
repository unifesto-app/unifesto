'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Image from 'next/image';
import GooglePlayBadge from '@/app/assets/svg/GetItOnGooglePlay_Badge_Web_color_English.svg';
import AppStoreBadge from '@/app/assets/svg/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg';

export default function DownloadPage() {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'unknown'>('unknown');
  const [redirecting, setRedirecting] = useState(false);

  const APP_PACKAGE = 'com.unifesto.app';
  const IOS_APP_ID = '6767165496';

  const APP_STORE_URL = `https://apps.apple.com/in/app/unifesto-discover-events/id${IOS_APP_ID}`;
  const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${APP_PACKAGE}`;

  useEffect(() => {
    // Detect platform
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;

    let detectedPlatform: 'ios' | 'android' | 'unknown' = 'unknown';

    // iOS detection
    if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) {
      detectedPlatform = 'ios';
    }
    // Android detection
    else if (/android/i.test(userAgent)) {
      detectedPlatform = 'android';
    }

    setPlatform(detectedPlatform);

    // Auto-redirect after a short delay
    if (detectedPlatform !== 'unknown') {
      setRedirecting(true);
      const timer = setTimeout(() => {
        const url = detectedPlatform === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
        window.location.href = url;
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, []);

  const handleDownload = (targetPlatform: 'ios' | 'android') => {
    const url = targetPlatform === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <Navbar />

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-56">
        <div className="max-w-3xl w-full text-center">

          {/* Title */}
          <h1 className="text-4xl md:text-5xl mb-4 bg-gradient-to-r from-blue-500 to-blue-600 bg-clip-text text-transparent">
            Download Unifesto
          </h1>

          {/* Description */}
          <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">
            Discover and register for events, manage your tickets, and connect with communities, all in one app.
          </p>

          {/* Auto-redirect message */}
          {redirecting && platform !== 'unknown' && (
            <div className="mb-8 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-center justify-center gap-2 text-blue-400">
                <Download className="w-5 h-5 animate-bounce" />
                <p>Redirecting to {platform === 'ios' ? 'App Store' : 'Play Store'}...</p>
              </div>
            </div>
          )}

          {/* Download Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            {/* iOS Button */}
            <button
              onClick={() => handleDownload('ios')}
              className="hover:scale-105 transition-transform duration-300"
            >
              <Image
                src={AppStoreBadge}
                alt="Download on the App Store"
                className="h-16 w-auto object-contain"
              />
            </button>

            {/* Android Button */}
            <button
              onClick={() => handleDownload('android')}
              className="hover:scale-105 transition-transform duration-300"
            >
              <Image
                src={GooglePlayBadge}
                alt="Get it on Google Play"
                className="h-16 w-auto object-contain"
              />
            </button>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <div className="p-6 rounded-xl bg-white/5 border border-white/10">
              <h3 className="font-semibold mb-2">Easy Registration</h3>
              <p className="text-sm text-gray-400">Register for events with just a few taps</p>
            </div>

            <div className="p-6 rounded-xl bg-white/5 border border-white/10">
              <h3 className="font-semibold mb-2">Digital Tickets</h3>
              <p className="text-sm text-gray-400">Access all your tickets in one place</p>
            </div>

            <div className="p-6 rounded-xl bg-white/5 border border-white/10">
              <h3 className="font-semibold mb-2">Cross-Platform</h3>
              <p className="text-sm text-gray-400">Available on iOS and Android</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
