/**
 * Application Constants
 */

// API Configuration
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.unifesto.app';

// Registration Configuration
export const REGISTRATION_TIME_LIMIT = 15 * 60; // 15 minutes in seconds

// Currency Symbols
export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
};

// Payment Methods
export const PAYMENT_METHODS = [
  { id: 'upi', name: 'UPI', icon: 'smartphone' },
  { id: 'card', name: 'Credit/Debit Card', icon: 'credit-card' },
  { id: 'netbanking', name: 'Net Banking', icon: 'building-2' },
  { id: 'wallet', name: 'Wallet', icon: 'wallet' },
];

// Registration Status
export const REGISTRATION_STATUS = {
  CONFIRMED: 'confirmed',
  CANCELLED: 'CANCELLED',
  WAITLISTED: 'waitlisted',
  CHECKED_IN: 'checked_in',
} as const;

// Payment Status
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'COMPLETED',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;

// Ticket Types
export const TICKET_TYPES = {
  INDIVIDUAL: 'individual',
  GROUP: 'group',
} as const;

// Price Types
export const PRICE_TYPES = {
  PER_PERSON: 'per_person',
  PER_GROUP: 'per_group',
} as const;

// Custom Field Types
export const FIELD_TYPES = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  EMAIL: 'email',
  PHONE: 'phone',
  NUMBER: 'number',
  DROPDOWN: 'dropdown',
  MULTI_SELECT: 'multi_select',
  RADIO: 'radio',
  DATE: 'date',
  FILE: 'file',
  CHECKBOX: 'checkbox',
  URL: 'url',
  COUNTRY: 'country',
  ID_PROOF_TYPE: 'id_proof_type',
  ID_PROOF_UPLOAD: 'id_proof_upload',
} as const;

// Gender Options
export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

// Validation Patterns
export const VALIDATION_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^[0-9]{10}$/,
  URL: /^https?:\/\/.+/,
};

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  PAYMENT_CANCELLED: 'Payment was cancelled.',
  PAYMENT_FAILED: 'Payment failed. Please try again.',
  REGISTRATION_FAILED: 'Registration failed. Please try again.',
  INVALID_EMAIL: 'Please enter a valid email address.',
  INVALID_PHONE: 'Please enter a valid 10-digit phone number.',
  REQUIRED_FIELD: 'This field is required.',
  TICKET_UNAVAILABLE: 'This ticket is no longer available.',
  SESSION_EXPIRED: 'Your session has expired. Please login again.',
};

// Success Messages
export const SUCCESS_MESSAGES = {
  REGISTRATION_SUCCESS: 'Registration successful!',
  PAYMENT_SUCCESS: 'Payment completed successfully!',
  CANCELLATION_SUCCESS: 'Registration cancelled successfully.',
};

// Event Categories
export const ALL_CATEGORIES = [
  'All',
  'Music',
  'Sports',
  'Arts',
  'Technology',
  'Business',
  'Food',
  'Health',
  'Education',
  'Other',
];

// Event Status Tabs
export const STATUS_TABS = [
  { id: 'all', label: 'All Events' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'ongoing', label: 'Ongoing' },
  { id: 'past', label: 'Past' },
];

// Date Filters
export const DATE_FILTERS = [
  { id: 'all', label: 'All Dates' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'this_week', label: 'This Week' },
  { id: 'this_month', label: 'This Month' },
];

// Price Filters
export const PRICE_FILTERS = [
  { id: 'all', label: 'All Prices' },
  { id: 'free', label: 'Free' },
  { id: 'paid', label: 'Paid' },
];
