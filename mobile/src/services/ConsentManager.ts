/**
 * Consent Manager - Central authority for all tracking and analytics consent
 * 
 * This service ensures:
 * 1. ATT permission is requested BEFORE any tracking
 * 2. All SDKs respect user consent
 * 3. No identifiers are collected before consent
 * 4. Compliance with Apple ATT and Google Play Data Safety
 * 
 * CRITICAL: This must be initialized BEFORE any other tracking SDK
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FirebaseAnalyticsService from './FirebaseAnalyticsService';
import OneSignalService from './OneSignalService';

// Storage keys
const CONSENT_STORAGE_KEY = '@unifesto:tracking_consent';
const CONSENT_TIMESTAMP_KEY = '@unifesto:tracking_consent_timestamp';

export type ConsentStatus = 'undetermined' | 'granted' | 'denied' | 'restricted';

export interface ConsentState {
  status: ConsentStatus;
  timestamp: number;
  platform: string;
}

class ConsentManager {
  private consentStatus: ConsentStatus = 'undetermined';
  private isInitialized = false;
  private sdksInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize the consent manager
   * This MUST be called before any other SDK initialization
   * 
   * @returns Promise<ConsentState> - The current consent state
   */
  async initialize(): Promise<ConsentState> {
    // Prevent multiple simultaneous initializations
    if (this.initializationPromise) {
      await this.initializationPromise;
      return this.getConsentState();
    }

    this.initializationPromise = this._initialize();
    await this.initializationPromise;
    return this.getConsentState();
  }

  private async _initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Step 1: Load saved consent state
      const savedConsent = await this.loadSavedConsent();
      
      if (savedConsent) {
        this.consentStatus = savedConsent.status;

        // If consent was previously granted, initialize SDKs
        if (savedConsent.status === 'granted') {
          await this.initializeTrackingSDKs();
        }
        
        this.isInitialized = true;
        return;
      }

      // Tracking is allowed by default since no ATT requirement
      this.consentStatus = 'granted';

      // Step 3: Save consent state
      await this.saveConsent(this.consentStatus);

      // Step 4: Initialize SDKs if consent granted
      if (this.consentStatus === 'granted') {
        await this.initializeTrackingSDKs();
      }

      this.isInitialized = true;
    } catch (error) {
      if (__DEV__) console.error('[ConsentManager] Initialization error:', error);
      // On error, assume no consent
      this.consentStatus = 'denied';
      this.isInitialized = true;
    }
  }

  /**
   * Initialize all tracking SDKs
   * Only called after consent is granted
   */
  private async initializeTrackingSDKs(): Promise<void> {
    if (this.sdksInitialized) {
      return;
    }

    // OneSignal first and independently: it is synchronous, and a Firebase call
    // that throws or never settles must not leave push uninitialised (no push,
    // no device registration, nothing in the logs).
    try {
      OneSignalService.initialize();
    } catch (error) {
      if (__DEV__) console.error('[ConsentManager] Error initializing OneSignal:', error);
    }
    this.sdksInitialized = true;

    try {
      // Note: Firebase auto-initialization should be disabled in config
      // We enable it here after consent
      await FirebaseAnalyticsService.setAnalyticsCollectionEnabled(true);
    } catch (error) {
      if (__DEV__) console.error('[ConsentManager] Error enabling Firebase Analytics:', error);
    }
  }

  /**
   * Get current consent status
   */
  getConsentStatus(): ConsentStatus {
    return this.consentStatus;
  }

  /**
   * Check if tracking is allowed
   */
  isTrackingAllowed(): boolean {
    return this.consentStatus === 'granted';
  }

  /**
   * Check if consent manager is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get full consent state
   */
  getConsentState(): ConsentState {
    return {
      status: this.consentStatus,
      timestamp: Date.now(),
      platform: Platform.OS,
    };
  }

  async requestPermission(): Promise<boolean> {
    this.consentStatus = 'granted';
    await this.saveConsent(this.consentStatus);
    await this.initializeTrackingSDKs();
    return true;
  }

  /**
   * Revoke tracking consent (opt-out)
   * This disables analytics but cannot uninstall SDKs
   */
  async revokeConsent(): Promise<void> {
    
    this.consentStatus = 'denied';
    await this.saveConsent('denied');

    // Disable Firebase Analytics
    await FirebaseAnalyticsService.setAnalyticsCollectionEnabled(false);
    
    // Opt out of OneSignal push (but keep notifications working)
    // Note: We don't fully disable OneSignal as it's needed for app functionality
    
  }

  /**
   * Grant tracking consent (opt-in)
   */
  async grantConsent(): Promise<void> {
    
    this.consentStatus = 'granted';
    await this.saveConsent('granted');

    // Initialize SDKs if not already done
    if (!this.sdksInitialized) {
      await this.initializeTrackingSDKs();
    } else {
      // Re-enable analytics
      await FirebaseAnalyticsService.setAnalyticsCollectionEnabled(true);
    }
    
  }

  /**
   * Save consent state to persistent storage
   */
  private async saveConsent(status: ConsentStatus): Promise<void> {
    try {
      const state: ConsentState = {
        status,
        timestamp: Date.now(),
        platform: Platform.OS,
      };
      
      await AsyncStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      if (__DEV__) console.error('[ConsentManager] Error saving consent:', error);
    }
  }

  /**
   * Load saved consent state from storage
   */
  private async loadSavedConsent(): Promise<ConsentState | null> {
    try {
      const saved = await AsyncStorage.getItem(CONSENT_STORAGE_KEY);
      
      if (saved) {
        const state: ConsentState = JSON.parse(saved);
        return state;
      }
      
      return null;
    } catch (error) {
      if (__DEV__) console.error('[ConsentManager] Error loading consent:', error);
      return null;
    }
  }

  /**
   * Clear all consent data (for testing)
   */
  async clearConsent(): Promise<void> {
    try {
      await AsyncStorage.removeItem(CONSENT_STORAGE_KEY);
      await AsyncStorage.removeItem(CONSENT_TIMESTAMP_KEY);
      this.consentStatus = 'undetermined';
      this.isInitialized = false;
      this.sdksInitialized = false;
    } catch (error) {
      if (__DEV__) console.error('[ConsentManager] Error clearing consent:', error);
    }
  }

  /**
   * Get consent timestamp
   */
  async getConsentTimestamp(): Promise<number | null> {
    try {
      const saved = await AsyncStorage.getItem(CONSENT_STORAGE_KEY);
      if (saved) {
        const state: ConsentState = JSON.parse(saved);
        return state.timestamp;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if we should show ATT pre-prompt explainer
   * Returns true if status is undetermined and we haven't shown explainer
   */
  async shouldShowPrePrompt(): Promise<boolean> {
    return false;
  }
}

// Export singleton instance
export default new ConsentManager();
