import type { ReconRange } from '../../../lib/api/apexMoney';

/*
 * Date windows for the Razorpay-backed screens. The web takes a from/to date
 * pair; on a phone three presets cover the real use (the server defaults to
 * 30 days, and Razorpay settles on a ~T+2 cycle).
 */

export type WindowDays = '7' | '30' | '90';

export const WINDOWS: { value: WindowDays; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export const rangeFor = (days: WindowDays): ReconRange => ({ from: isoDaysAgo(Number(days)), to: isoDaysAgo(0) });
