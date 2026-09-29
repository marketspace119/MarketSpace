/**
 * MASTER PAYMENT METHOD ALLOWLIST & CANONICAL DEFINITIONS
 * Single Source of Truth across Frontend, Gateways, Database, Reports, and Settlements.
 */

export const MASTER_PAYMENT_METHODS = [
  'evc_plus',
  'zaad',
  'sahal',
  'edahab',
  'cash_on_delivery',
  'card',
] as const;

export type MasterPaymentMethod = (typeof MASTER_PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_ALIASES: Record<string, MasterPaymentMethod> = {
  cod: 'cash_on_delivery',
  cash_on_delivery: 'cash_on_delivery',
  cash: 'cash_on_delivery',
  evc_plus: 'evc_plus',
  evcplus: 'evc_plus',
  evc: 'evc_plus',
  zaad: 'zaad',
  sahal: 'sahal',
  sahall: 'sahal',
  edahab: 'edahab',
  card: 'card',
  credit_card: 'card',
  debit_card: 'card',
};

/**
 * Normalizes payment method string and resolves canonical alias.
 * Returns null if not recognized in the Master Allowlist.
 */
export function normalizePaymentMethod(method?: string | null): MasterPaymentMethod | null {
  if (!method || typeof method !== 'string') return null;
  const clean = method.toLowerCase().trim().replace(/[\s-]+/g, '_');
  return PAYMENT_METHOD_ALIASES[clean] || null;
}

/**
 * Checks if a method is valid under the Master Allowlist.
 */
export function isValidPaymentMethod(method?: string | null): boolean {
  return normalizePaymentMethod(method) !== null;
}

/**
 * Checks if payment method is a mobile money transfer requiring reference submission.
 */
export function isMobilePaymentMethod(method?: string | null): boolean {
  const norm = normalizePaymentMethod(method);
  return norm === 'evc_plus' || norm === 'zaad' || norm === 'sahal' || norm === 'edahab';
}

/**
 * Checks if payment method is cash on delivery.
 */
export function isCashPaymentMethod(method?: string | null): boolean {
  const norm = normalizePaymentMethod(method);
  return norm === 'cash_on_delivery';
}
