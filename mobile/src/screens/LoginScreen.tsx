import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  ScrollView,
  Linking,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaretLeft,
  CheckCircle,
  EnvelopeSimple,
  WarningCircle,
  WhatsappLogo,
  X,
} from '@unifesto/unicon/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { cognitoDiscovery, COGNITO_REDIRECT_URI, exchangeCognitoCode } from '../lib/api/cognito';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';
import { Image } from 'expo-image';
import AuthButton from '../components/auth/AuthButton';
import AuthField from '../components/auth/AuthField';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import OtpCodeInput from '../components/auth/OtpCodeInput';
import SocialAuthButton from '../components/auth/SocialAuthButton';
import { cosmosFont, useCosmos } from '../theme/cosmos';

type LoginStep = 'email' | 'email-otp' | 'mobile' | 'mobile-otp';

const RESEND_SECONDS = 60;

const GOOGLE_WEB_CLIENT_ID = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  offlineAccess: false,
});

const formatCountdown = (s: number) => `0:${String(s).padStart(2, '0')}`;
const formatMobile = (n: string) => (n.length === 10 ? `${n.slice(0, 5)} ${n.slice(5)}` : n);

export default function NewLoginScreen() {
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Where to land after sign-in, e.g. a claim link opened while signed out.
  // Only in-app paths are honoured ("/x", never "//host" or a full URL).
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const home = typeof redirect === 'string' && /^\/(?!\/)/.test(redirect) ? (redirect as any) : '/(tabs)';
  const {
    sendEmailOtp,
    verifyEmailOtp,
    sendMobileOtp,
    verifyMobileOtp,
    loginWithCognito,
    loginWithApple,
    user,
    token,
    isAuthenticated,
    tempToken: contextTempToken,
  } = useAuth();

  const [step, setStep] = useState<LoginStep>('email');

  // When context sets tempToken (new user after email OTP), move to mobile step
  useEffect(() => {
    if (contextTempToken && step === 'email-otp') {
      setStep('mobile');
    }
  }, [contextTempToken]);
  const [email, setEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [mobileOtp, setMobileOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [canResend, setCanResend] = useState(false);
  const [resendTimer, setResendTimer] = useState(RESEND_SECONDS);
  // Auto-verify fires from the OTP input before isLoading re-renders; this ref
  // stops a paste + tap from submitting the same code twice.
  const submittingRef = useRef(false);

  const isOtpStep = step === 'email-otp' || step === 'mobile-otp';

  // ── Error shake ────────────────────────────────────────────────────────────
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  useEffect(() => {
    if (!error) return;
    shakeX.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(-5, { duration: 50 }),
      withTiming(5, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  }, [error]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  // ── Google (via Cognito hosted UI) ─────────────────────────────────────────
  const [googleCognitoRequest, googleCognitoResponse, googleCognitoPrompt] = AuthSession.useAuthRequest(
    {
      clientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID || '',
      scopes: ['openid', 'email', 'profile', 'phone'],
      redirectUri: COGNITO_REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: { identity_provider: 'Google' },
    },
    cognitoDiscovery
  );

  const handleCognitoResponse = async (
    response: AuthSession.AuthSessionResult | null,
    request: AuthSession.AuthRequest | null
  ) => {
    if (response?.type === 'success' && response.params.code) {
      try {
        const idToken = await exchangeCognitoCode(
          response.params.code,
          request?.codeVerifier || ''
        );
        await loginWithCognito(idToken);
      } catch (err: any) {
        setError(err.message || 'Sign-in failed');
      } finally {
        setIsLoading(false);
      }
    } else if (response?.type === 'error') {
      setError(response.error?.message || 'Sign-in failed');
      setIsLoading(false);
    } else {
      // dismiss / cancel / anything else: user backed out of the browser sheet
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && token && isAuthenticated && user.mobileVerified) {
      router.replace(home);
    }
  }, [user, token, isAuthenticated]);

  useEffect(() => {
    if (user && !user.mobileVerified) {
      setStep('mobile');
    }
  }, [user]);

  useEffect(() => {
    if (resendTimer > 0 && isOtpStep) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    } else if (resendTimer === 0) {
      setCanResend(true);
    }
  }, [resendTimer, step]);

  useEffect(() => {
    if (googleCognitoResponse) {
      handleCognitoResponse(googleCognitoResponse, googleCognitoRequest);
    }
  }, [googleCognitoResponse]);

  const startResendCountdown = () => {
    setResendTimer(RESEND_SECONDS);
    setCanResend(false);
  };

  // ── Email ──────────────────────────────────────────────────────────────────
  const handleSendEmailOtp = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email address');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('That email doesn\'t look right');
      return;
    }
    setEmail(trimmed);
    setIsLoading(true);
    setError('');
    try {
      await sendEmailOtp(trimmed);
      setEmailOtp('');
      setStep('email-otp');
      startResendCountdown();
    } catch (err: any) {
      setError(err.message || 'Couldn\'t send the code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (code: string = emailOtp) => {
    if (code.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    setError('');
    try {
      await verifyEmailOtp(email, code);
      // If new user, context sets tempToken — effect above moves to mobile step
    } catch (err: any) {
      setError(err.message || 'That code didn\'t work');
      setEmailOtp('');
    } finally {
      submittingRef.current = false;
      setIsLoading(false);
    }
  };

  // ── Mobile ─────────────────────────────────────────────────────────────────
  const handleSendMobileOtp = async () => {
    if (!mobileNumber) {
      setError('Enter your mobile number');
      return;
    }
    if (!/^[0-9]{10}$/.test(mobileNumber)) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await sendMobileOtp('+91' + mobileNumber);
      setMobileOtp('');
      setStep('mobile-otp');
      startResendCountdown();
    } catch (err: any) {
      setError(err.message || 'Couldn\'t send the code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyMobileOtp = async (code: string = mobileOtp) => {
    if (code.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    setError('');
    try {
      const result = await verifyMobileOtp('+91' + mobileNumber, code);
      if (result?.isNewUser) {
        router.replace(home);
      }
    } catch (err: any) {
      setError(err.message || 'That code didn\'t work');
      setMobileOtp('');
    } finally {
      submittingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend) return;
    startResendCountdown();
    setError('');
    try {
      if (step === 'email-otp') {
        await sendEmailOtp(email);
        setNotice('New code sent to your inbox');
      } else if (step === 'mobile-otp') {
        await sendMobileOtp('+91' + mobileNumber);
        setNotice('New code sent on WhatsApp');
      }
    } catch (err: any) {
      setError(err.message || 'Couldn\'t resend the code');
      setCanResend(true);
    }
  };

  // ── Social ─────────────────────────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
      if (!GOOGLE_WEB_CLIENT_ID && !GOOGLE_IOS_CLIENT_ID && !GOOGLE_ANDROID_CLIENT_ID) {
        throw new Error('Google Sign-In is not configured. Please add Google Client IDs to your .env file.');
      }
      await googleCognitoPrompt();
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
      setIsLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken || !credential.authorizationCode) {
        throw new Error('Apple did not return a usable credential');
      }

      await loginWithApple(credential.identityToken, credential.authorizationCode);
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        setError(err.message || 'Apple sign-in failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goTo = (next: LoginStep) => {
    setError('');
    setNotice('');
    setStep(next);
  };

  const handleBack = () => {
    if (step === 'email-otp') {
      setEmailOtp('');
      goTo('email');
    } else if (step === 'mobile-otp') {
      setMobileOtp('');
      goTo('mobile');
    } else if (step === 'mobile') {
      setMobileNumber('');
      goTo('email');
    } else if (router.canGoBack()) {
      router.back();
    }
  };

  // On the first step the control only makes sense if there's somewhere to go
  // back to (pushed from a guest screen, not replaced after logout).
  const showHeaderControl = step !== 'email' || router.canGoBack();

  // ── Styles ─────────────────────────────────────────────────────────────────
  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: insets.top + 8,
      paddingBottom: insets.bottom + 24,
    },
    topBar: {
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 28,
    },
    iconButton: {
      width: 40,
      height: 40,
      marginLeft: -8,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    stepPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: c.outline,
    },
    stepPillText: { fontSize: 12, color: c.text, ...cosmosFont.strong },

    hero: { marginBottom: 32 },
    wordmark: { width: 116, height: 27, marginBottom: 40 },
    display: { fontSize: 28, lineHeight: 36, color: c.text, ...cosmosFont.display },
    displayMuted: { color: c.muted },
    title: { fontSize: 22, lineHeight: 30, color: c.text, ...cosmosFont.display },
    lead: { marginTop: 14, fontSize: 16, lineHeight: 24, color: c.muted, ...cosmosFont.body },
    leadStrong: { color: c.text, ...cosmosFont.strong },
    badge: { marginBottom: 20 },
    destination: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginTop: 10,
      gap: 10,
    },
    editLink: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: c.outline,
    },
    editLinkText: { fontSize: 13, color: c.text, ...cosmosFont.strong },

    stack: { gap: 12 },
    divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
    dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.input },
    dividerText: { marginHorizontal: 12, fontSize: 13, color: c.muted, ...cosmosFont.body },
    cta: { marginTop: 20 },

    message: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    messageText: { flex: 1, fontSize: 14, ...cosmosFont.strong },

    resendRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 24,
      gap: 4,
    },
    resendText: { fontSize: 14, color: c.muted, ...cosmosFont.body },
    resendAction: { fontSize: 14, color: c.text, textDecorationLine: 'underline', ...cosmosFont.strong },
    resendTimer: { fontSize: 14, color: c.text, fontVariant: ['tabular-nums'], ...cosmosFont.strong },

    hint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
    hintText: { flex: 1, fontSize: 14, color: c.muted, ...cosmosFont.body },

    footer: { flex: 1, justifyContent: 'flex-end', paddingTop: 40 },
    legal: { fontSize: 12, lineHeight: 19, color: c.muted, textAlign: 'center', ...cosmosFont.body },
    legalLink: { color: c.text, textDecorationLine: 'underline' },
  });

  // ── Pieces ─────────────────────────────────────────────────────────────────
  const renderMessage = () => {
    if (error) {
      return (
        <Animated.View entering={FadeIn.duration(160)} style={styles.message} accessibilityLiveRegion="polite">
          <WarningCircle size={16} color={c.danger} weight="fill" />
          <Text style={[styles.messageText, { color: c.danger }]}>{error}</Text>
        </Animated.View>
      );
    }
    if (notice) {
      return (
        <Animated.View entering={FadeIn.duration(160)} style={styles.message} accessibilityLiveRegion="polite">
          <CheckCircle size={16} color={c.text} weight="fill" />
          <Text style={[styles.messageText, { color: c.text }]}>{notice}</Text>
        </Animated.View>
      );
    }
    return null;
  };

  const renderResend = () => (
    <View style={styles.resendRow}>
      {canResend ? (
        <>
          <Text style={styles.resendText}>Didn't get it?</Text>
          <Pressable onPress={handleResendOtp} hitSlop={8} accessibilityRole="button">
            <Text style={styles.resendAction}>Resend code</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.resendText}>Resend code in</Text>
          <Text style={styles.resendTimer}>{formatCountdown(resendTimer)}</Text>
        </>
      )}
    </View>
  );

  // ── Steps ──────────────────────────────────────────────────────────────────
  const renderEmailStep = () => (
    <>
      <View style={styles.hero}>
        <Image
          source={
            c.scheme === 'dark'
              ? require('../../assets/brand/wordmark-silver.png')
              : require('../../assets/brand/wordmark-ink.png')
          }
          style={styles.wordmark}
          contentFit="contain"
          accessibilityLabel="Unifesto"
        />
        <Text style={styles.display}>
          Every fest.{'\n'}
          <Text style={styles.displayMuted}>One app.</Text>
        </Text>
        <Text style={styles.lead}>
          Sign in to grab tickets, save events and keep every pass in one place.
        </Text>
      </View>

      <View style={styles.stack}>
        {Platform.OS === 'ios' && (
          <SocialAuthButton provider="apple" onPress={handleAppleLogin} disabled={isLoading} />
        )}
        <SocialAuthButton provider="google" onPress={handleGoogleLogin} disabled={isLoading} />
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or use email</Text>
        <View style={styles.dividerLine} />
      </View>

      <Animated.View style={shakeStyle}>
        <AuthField
          label="Email"
          placeholder="you@college.edu"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError('');
          }}
          onSubmitEditing={handleSendEmailOtp}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          editable={!isLoading}
          error={!!error}
        />
      </Animated.View>
      {renderMessage()}

      <AuthButton
        label="Continue with email"
        onPress={handleSendEmailOtp}
        loading={isLoading}
        arrow
        style={styles.cta}
      />
    </>
  );

  const renderOtpStep = (kind: 'email' | 'mobile') => {
    const isEmail = kind === 'email';
    const value = isEmail ? emailOtp : mobileOtp;
    const setValue = isEmail ? setEmailOtp : setMobileOtp;
    const verify = isEmail ? handleVerifyEmailOtp : handleVerifyMobileOtp;

    return (
      <>
        <View style={styles.hero}>
          <View style={styles.badge}>
            {isEmail ? (
              <EnvelopeSimple size={40} color={c.text} weight="light" />
            ) : (
              <WhatsappLogo size={40} color={c.text} weight="light" />
            )}
          </View>
          <Text style={styles.title}>{isEmail ? 'Check your inbox' : 'Check WhatsApp'}</Text>
          <Text style={styles.lead}>Enter the 6-digit code we sent to</Text>
          <View style={styles.destination}>
            <Text style={[styles.lead, styles.leadStrong, { marginTop: 0 }]} numberOfLines={1}>
              {isEmail ? email : `+91 ${formatMobile(mobileNumber)}`}
            </Text>
            <Pressable onPress={handleBack} hitSlop={8} style={styles.editLink} accessibilityRole="button">
              <Text style={styles.editLinkText}>Edit</Text>
            </Pressable>
          </View>
        </View>

        <Animated.View style={shakeStyle}>
          <OtpCodeInput
            value={value}
            onChange={(code) => {
              setValue(code);
              setError('');
            }}
            onComplete={(code) => verify(code)}
            error={!!error}
            disabled={isLoading}
          />
        </Animated.View>
        {renderMessage()}

        <AuthButton
          label={isEmail ? 'Verify' : 'Verify and finish'}
          onPress={() => verify()}
          loading={isLoading}
          disabled={value.length !== 6}
          arrow
          style={styles.cta}
        />

        {renderResend()}
      </>
    );
  };

  const renderMobileStep = () => (
    <>
      <View style={styles.hero}>
        <View style={styles.badge}>
          <WhatsappLogo size={40} color={c.text} weight="light" />
        </View>
        <Text style={styles.title}>Add your number</Text>
        <Text style={styles.lead}>
          We verify every account with a quick WhatsApp code. It keeps your tickets safe.
        </Text>
      </View>

      <Animated.View style={shakeStyle}>
        <AuthField
          label="Mobile number"
          prefix="+91"
          placeholder="98765 43210"
          value={mobileNumber}
          onChangeText={(text) => {
            setMobileNumber(text.replace(/\D/g, ''));
            setError('');
          }}
          onSubmitEditing={handleSendMobileOtp}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel-national"
          autoCorrect={false}
          maxLength={10}
          editable={!isLoading}
          autoFocus
          error={!!error}
        />
      </Animated.View>
      {renderMessage()}

      <AuthButton
        label="Send code on WhatsApp"
        onPress={handleSendMobileOtp}
        loading={isLoading}
        arrow
        style={styles.cta}
      />

      <View style={styles.hint}>
        <Text style={styles.hintText}>
          Signed in with the wrong email?{' '}
          <Text style={styles.resendAction} onPress={handleBack} accessibilityRole="link">
            Start over
          </Text>
        </Text>
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <CosmosBackdrop />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.topBar}>
          {showHeaderControl ? (
            <Pressable
              onPress={handleBack}
              hitSlop={8}
              style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={step === 'email' ? 'Close' : 'Back'}
            >
              {step === 'email' ? (
                <X size={22} color={c.text} />
              ) : (
                <CaretLeft size={22} color={c.text} />
              )}
            </Pressable>
          ) : (
            <View />
          )}
          {(step === 'mobile' || step === 'mobile-otp') && (
            <View style={styles.stepPill}>
              <Text style={styles.stepPillText}>Last step</Text>
            </View>
          )}
        </View>

        <Animated.View key={step} entering={FadeInDown.duration(320)}>
          {step === 'email' && renderEmailStep()}
          {step === 'email-otp' && renderOtpStep('email')}
          {step === 'mobile' && renderMobileStep()}
          {step === 'mobile-otp' && renderOtpStep('mobile')}
        </Animated.View>

        <View style={styles.footer}>
          <Text style={styles.legal}>
            By continuing you agree to our{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL('https://unifesto.app/terms')}>
              Terms
            </Text>{' '}
            and{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL('https://unifesto.app/privacy')}>
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
