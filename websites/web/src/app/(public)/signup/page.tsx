'use client';

import { useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { DeviceMobile } from '@unifesto/unicon/react';
import { openAppOrStore, detectMobilePlatform, useAppHref } from '@/lib/appLinks';

function SignupRedirect() {
  const appScheme = `unifesto://signup`;
  const appHref = useAppHref(appScheme);

  useEffect(() => {
    // On mobile, try to open the app; if it isn't installed, openAppOrStore
    // redirects to the store. On desktop we leave the page as-is (manual
    // buttons below) rather than bouncing them anywhere.
    if (detectMobilePlatform() === 'unknown') return;

    let cleanup = () => {};
    const timer = setTimeout(() => {
      cleanup = openAppOrStore(appScheme);
    }, 500);

    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, [appScheme]);

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <Navbar />
      <div className="flex flex-1 items-center justify-center px-5 pb-20 pt-32">
        <div className="animate-pop-in w-full max-w-md rounded-3xl bg-night-2 p-8 text-center sm:p-10">
          <DeviceMobile className="mx-auto h-12 w-12 text-primary" weight="bold" aria-hidden="true" />
          <h1 className="mt-6 font-display text-3xl font-bold text-paper" style={{ letterSpacing: '-0.03em' }}>
            Open in the app
          </h1>
          <p className="mt-3 text-base leading-relaxed text-paper/70">
            This signup link is meant to be opened in the Unifesto app.
          </p>
          <a
            href={appHref}
            onClick={(e) => {
              e.preventDefault();
              openAppOrStore(appScheme);
            }}
            className="btn btn-lg btn-primary mt-8 w-full"
          >
            Open the app
          </a>
          <p className="mt-6 text-sm text-paper/60">
            Don&apos;t have it yet?{' '}
            <a href="/download" className="link-draw font-semibold text-primary">
              Get Unifesto
            </a>
          </p>
        </div>
      </div>
      <Footer />
    </main>
  );
}

export default function SignupPage() {
  return <SignupRedirect />;
}
