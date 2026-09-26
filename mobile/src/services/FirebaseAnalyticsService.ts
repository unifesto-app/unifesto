/**
 * Firebase Analytics Service - Centralized wrapper for Firebase Analytics
 * Uses modular API (v22+)
 */

let getAnalytics: any = null;
let logEvent: any = null;
let setUserId: any = null;
let setUserProperty: any = null;
let setAnalyticsCollectionEnabled: any = null;

try {
  const mod = require('@react-native-firebase/analytics');
  getAnalytics = mod.getAnalytics;
  logEvent = mod.logEvent;
  setUserId = mod.setUserId;
  setUserProperty = mod.setUserProperty;
  setAnalyticsCollectionEnabled = mod.setAnalyticsCollectionEnabled;
} catch (error) {
  // Firebase Analytics not available in Expo Go
}

class FirebaseAnalyticsService {
  private get analytics() {
    if (!getAnalytics) return null;
    try { return getAnalytics(); } catch { return null; }
  }

  async logEvent(eventName: string, params?: Record<string, any>): Promise<void> {
    const a = this.analytics;
    if (!a || !logEvent) return;
    try { await logEvent(a, eventName, params); } catch {}
  }

  async logScreenView(screenName: string, screenClass?: string): Promise<void> {
    await this.logEvent('screen_view', {
      screen_name: screenName,
      screen_class: screenClass || screenName,
    });
  }

  async setUserId(userId: string | null): Promise<void> {
    const a = this.analytics;
    if (!a || !setUserId) return;
    try { await setUserId(a, userId); } catch {}
  }

  async setUserProperty(name: string, value: string | null): Promise<void> {
    const a = this.analytics;
    if (!a || !setUserProperty) return;
    try { await setUserProperty(a, name, value); } catch {}
  }

  async setUserProperties(properties: Record<string, string | null>): Promise<void> {
    await Promise.all(
      Object.entries(properties).map(([name, value]) => this.setUserProperty(name, value))
    );
  }

  async setAnalyticsCollectionEnabled(enabled: boolean): Promise<void> {
    const a = this.analytics;
    if (!a || !setAnalyticsCollectionEnabled) return;
    try { await setAnalyticsCollectionEnabled(a, enabled); } catch {}
  }

  async resetAnalyticsData(): Promise<void> {
    try {
      const mod = require('@react-native-firebase/analytics');
      const a = this.analytics;
      if (a && mod.resetAnalyticsData) await mod.resetAnalyticsData(a);
    } catch {}
  }

  async logLogin(method: string): Promise<void> { await this.logEvent('login', { method }); }
  async logSignUp(method: string): Promise<void> { await this.logEvent('sign_up', { method }); }
  async logSearch(searchTerm: string): Promise<void> { await this.logEvent('search', { search_term: searchTerm }); }
  async logSelectContent(contentType: string, itemId: string): Promise<void> {
    await this.logEvent('select_content', { content_type: contentType, item_id: itemId });
  }
  async logShare(contentType: string, itemId: string, method: string): Promise<void> {
    await this.logEvent('share', { content_type: contentType, item_id: itemId, method });
  }
  async logPurchase(transactionId: string, value: number, currency = 'INR', items?: any[]): Promise<void> {
    await this.logEvent('purchase', { transaction_id: transactionId, value, currency, items });
  }
}

export default new FirebaseAnalyticsService();
