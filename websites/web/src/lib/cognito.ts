/*
 * K18: Google sign-in on the web, through the same Cognito hosted UI the app
 * uses (auth.unifesto.app, authorization code + PKCE, Google as the identity
 * provider). Public values only: the app client has no secret.
 */
export const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? "";
export const COGNITO_CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "";
/** Must be listed in the app client's allowed callback URLs (AWS console). */
export const COGNITO_REDIRECT_URI = process.env.COGNITO_REDIRECT_URI || "https://unifesto.app/auth/callback";

export const googleSignInEnabled = Boolean(COGNITO_DOMAIN && COGNITO_CLIENT_ID);
