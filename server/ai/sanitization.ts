/**
 * Data Minimization and Prompt Injection Defense Utilities
 */

/**
 * Masks phone numbers to protect customer privacy (e.g. +252 61 5111111 -> +252 *** 1111)
 */
export function maskPhoneNumber(phone?: string): string {
  if (!phone) return 'N/A';
  const clean = phone.trim();
  if (clean.length <= 4) return '****';
  return clean.slice(0, 4) + ' *** ' + clean.slice(-4);
}

/**
 * Masks customer names for general operational analytics
 */
export function maskName(name?: string): string {
  if (!name) return 'Customer';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1) + '***';
  return `${parts[0]} ${parts[parts.length - 1].slice(0, 1)}.`;
}

/**
 * Sanitizes user prompts against prompt-injection delimiters and command override patterns.
 * Wraps user inputs safely and strips prompt-hijacking markers.
 */
export function sanitizeUserPrompt(rawPrompt: string, maxLength: number = 2000): string {
  if (!rawPrompt || typeof rawPrompt !== 'string') {
    return '';
  }

  let sanitized = rawPrompt.slice(0, maxLength);

  // Normalize control chars, null bytes
  sanitized = sanitized.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '');

  // Defuse explicit prompt injection patterns
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/gi,
    /system\s+override/gi,
    /you\s+are\s+now\s+in\s+developer\s+mode/gi,
    /disregard\s+(all\s+)?safety/gi,
    /reveal\s+(all\s+)?(system|internal|prompt|api\s*key)/gi,
  ];

  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '[BLOCKED_INSTRUCTION]');
  }

  return sanitized.trim();
}

/**
 * Sanitizes AI-generated output before returning to browser to prevent XSS.
 * Removes dangerous tags, javascript protocols, and event handlers.
 */
export function sanitizeAIOutput(rawOutput: string): string {
  if (!rawOutput || typeof rawOutput !== 'string') {
    return '';
  }

  let cleaned = rawOutput;

  // Strip script tags, iframes, objects, embeds
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  cleaned = cleaned.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  cleaned = cleaned.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  cleaned = cleaned.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');

  // Strip inline javascript: and data: URIs
  cleaned = cleaned.replace(/href\s*=\s*["']?javascript:[^"'>]*/gi, 'href="#"');
  cleaned = cleaned.replace(/src\s*=\s*["']?javascript:[^"'>]*/gi, 'src=""');
  cleaned = cleaned.replace(/src\s*=\s*["']?data:text\/html[^"'>]*/gi, 'src=""');

  // Strip event handler attributes (onclick, onerror, onload, etc.)
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*[^>\s]+/gi, '');

  return cleaned.trim();
}

/**
 * Sanitizes and minimizes order data for AI ingestion.
 * Strictly removes payment references, account numbers, and street-level addresses.
 */
export function minimizeOrderForAI(order: any, isCallerCustomer: boolean = false): Record<string, any> {
  return {
    orderId: order.orderId || order.id,
    date: order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : 'unknown',
    itemCount: Array.isArray(order.items) ? order.items.length : 0,
    itemSummaries: Array.isArray(order.items)
      ? order.items.map((i: any) => ({
          title: (typeof i.title === 'object' ? i.title.en || i.title.ar : i.title) || 'Product',
          quantity: i.quantity || 1,
          price: i.price || 0,
        }))
      : [],
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    total: order.total,
    city: order.city || 'Mogadishu',
    // Customer identity is either masked or omitted
    customer: isCallerCustomer
      ? { name: order.customerName }
      : { name: maskName(order.customerName) },
    // Notice: NO phone number, NO street address, NO payment references, NO secret codes
  };
}

/**
 * Sanitizes and minimizes seller product data for AI ingestion.
 */
export function minimizeProductForAI(prod: any): Record<string, any> {
  return {
    id: prod.id,
    title: typeof prod.title === 'object' ? prod.title.en || prod.title.ar : prod.title,
    category: prod.category,
    price: prod.price,
    stock: prod.stock,
    rating: prod.rating,
    salesCount: prod.salesCount || prod.orderCount || 0,
    isActive: prod.isActive ?? true,
  };
}
