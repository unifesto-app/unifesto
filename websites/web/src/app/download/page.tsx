'use client';

import { useEffect, useState } from 'react';
import { Ticket, Lightning, DeviceMobile, CircleNotch } from '@unifesto/unicon/react';
import PageHero from '@/components/site/PageHero';
import Section from '@/components/site/Section';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Image from 'next/image';
import GooglePlayBadge from '@/app/assets/svg/GetItOnGooglePlay_Badge_Web_color_English.svg';
import AppStoreBadge from '@/app/assets/svg/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg';

export default function DownloadPage() {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'unknown'>('unknown');
  const [redirecting, setRedirecting] = useState(false);
  // The page that sent a desktop visitor here (openAppOrStore), e.g. /event/x.
  const [from, setFrom] = useState<string | null>(null);

  const APP_PACKAGE = 'com.unifesto.app';
  const IOS_APP_ID = '6767165496';

  const APP_STORE_URL = `https://apps.apple.com/in/app/unifesto-discover-events/id${IOS_APP_ID}`;
  const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${APP_PACKAGE}`;

  useEffect(() => {
    // Detect platform
    const userAgent = navigator.userAgent || navigator.vendor || (window as Window & { opera?: string }).opera || '';

    let detectedPlatform: 'ios' | 'android' | 'unknown' = 'unknown';

    // iOS detection
    if (/iPad|iPhone|iPod/.test(userAgent) && !('MSStream' in window)) {
      detectedPlatform = 'ios';
    }
    // Android detection
    else if (/android/i.test(userAgent)) {
      detectedPlatform = 'android';
    }

    setPlatform(detectedPlatform);

    // Same-site paths only, so this can't become an open redirect.
    const f = new URLSearchParams(window.location.search).get('from');
    if (f?.startsWith('/') && !f.startsWith('//')) setFrom(f);

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

  const badges = (
    <>
      <button onClick={() => handleDownload('ios')} className="transition-opacity duration-150 hover:opacity-85 active:scale-[0.97]">
        <Image src={AppStoreBadge} alt="Download on the App Store" className="h-14 w-auto" />
      </button>
      <button onClick={() => handleDownload('android')} className="transition-opacity duration-150 hover:opacity-85 active:scale-[0.97]">
        <Image src={GooglePlayBadge} alt="Get it on Google Play" className="h-14 w-auto" />
      </button>
    </>
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />

      <PageHero
        lines={['Your passes live', 'in the app.']}
        accentFrom={1}
        lede={
          <>
            {from ? (
              <>
                Registration happens in the app. Open{' '}
                <span className="break-all font-semibold text-paper">{window.location.host}{from}</span> on your phone, or get
                the app below.{' '}
                <a href={from} className="link-draw font-semibold text-primary">
                  Back to where you were
                </a>
              </>
            ) : (
              'Discover and register for events, keep every ticket in one place, and get in with one scan.'
            )}
            {redirecting && platform !== 'unknown' && (
              <span role="status" className="mt-6 flex items-center gap-2 text-sm font-semibold text-primary">
                <CircleNotch className="h-4 w-4 animate-spin" weight="bold" aria-hidden="true" />
                Opening the {platform === 'ios' ? 'App Store' : 'Play Store'}…
              </span>
            )}
          </>
        }
        actions={badges}
      />

      <Section surface="paper" pad="tight">
        <ul className="grid gap-10 md:grid-cols-3" data-stagger="rise">
          {[
            { icon: Lightning, title: 'Register in a tap', body: 'Most events take a couple of taps, with your details filled in.' },
            { icon: Ticket, title: 'Every pass, one place', body: 'Your QR passes, sorted by what is next.' },
            { icon: DeviceMobile, title: 'iPhone and Android', body: 'The same app on both, free on each store.' },
          ].map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <Icon className="h-7 w-7 text-primary-deep" weight="bold" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-bold text-ink">{title}</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink/70">{body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Footer />
    </main>
  );
}
