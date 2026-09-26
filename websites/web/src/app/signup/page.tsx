'use client';

import { useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { openAppOrStore, detectMobilePlatform } from '@/lib/appLinks';

function SignupRedirect() {
  const appScheme = `unifesto://signup`;

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
    <main className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />

      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center mt-20">
        <div className="max-w-md w-full bg-zinc-900/50 p-8 rounded-2xl border border-zinc-800 backdrop-blur-xl">
          <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-blue-400 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
            Open in App
          </h1>

          <p className="text-zinc-400 mb-8 text-lg">
            This signup link is designed to be opened in the Unifesto mobile app.
          </p>

          <a
            href={appScheme}
            onClick={(e) => {
              e.preventDefault();
              openAppOrStore(appScheme);
            }}
            className="block w-full py-4 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all mb-4"
          >
            Open App Now
          </a>

          <div className="text-sm text-zinc-500 mt-6">
            Don't have the app yet? <br />
            <a href="/download" className="text-blue-400 hover:text-blue-300 underline mt-2 inline-block">Download Unifesto</a>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}

export default function SignupPage() {
  return <SignupRedirect />;
}
