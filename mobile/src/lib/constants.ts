/**
 * Application Constants
 */

// API Configuration
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.unifesto.app';

// One email check for every form, so they can't drift apart.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s: string) => EMAIL_RE.test(s.trim());
