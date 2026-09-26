import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import SplashScreen from '../src/screens/SplashScreen';

export default function Index() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  const { isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    // Mark as loaded when auth finishes loading
    if (!isLoading) {
      setIsLoaded(true);
    }
  }, [isLoading]);

  // Show splash screen with exit animation when loaded
  if (!animationComplete) {
    return (
      <SplashScreen 
        shouldExit={isLoaded}
        onAnimationComplete={() => setAnimationComplete(true)}
      />
    );
  }

  // Always go straight to tabs — profile completion is a banner there instead of a forced screen

  return <Redirect href="/(tabs)" />;
}
