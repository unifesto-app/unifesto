// Fallback for platforms without a dedicated layout (web). iOS uses
// _layout.ios.tsx (native tabs) and Android _layout.android.tsx (floating bar).
export { default } from './_layout.ios';
