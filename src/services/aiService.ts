import { auth } from '../lib/firebase';

export interface AIAssistantResponse {
  success: boolean;
  response?: string;
  scope?: string;
  error?: string;
}

export interface AISearchResponse {
  success: boolean;
  query?: string;
  interpretedIntent?: string;
  keywords?: string[];
  suggestedCategories?: string[];
  products?: any[];
  error?: string;
}

export interface AIReportResponse {
  success: boolean;
  summary?: string;
  reportType?: string;
  error?: string;
}

export interface AICopywritingResponse {
  success: boolean;
  copy?: string;
  error?: string;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (auth?.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (e) {
      console.warn('[AIService] Failed to retrieve Firebase ID token:', e);
    }
  }
  return headers;
}

const getBaseUrl = (): string => {
  return typeof window !== 'undefined' ? '' : (process.env.API_BASE_URL || 'http://127.0.0.1:3000');
};

export const aiService = {
  /**
   * Queries the role-scoped AI Assistant (Business, Seller, or Customer Support)
   */
  async queryAssistant(
    mode: 'business' | 'seller' | 'customer',
    prompt: string,
    options?: { storeId?: string; orderId?: string; actionType?: string }
  ): Promise<AIAssistantResponse> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${getBaseUrl()}/api/ai/assistant`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode,
        prompt,
        storeId: options?.storeId,
        orderId: options?.orderId,
        actionType: options?.actionType,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `AI assistant request failed (${res.status})`);
    }
    return data;
  },

  /**
   * Performs semantic natural-language smart search across active products
   */
  async smartSearch(query: string, limit: number = 10): Promise<AISearchResponse> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${getBaseUrl()}/api/ai/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, limit }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `AI smart search request failed (${res.status})`);
    }
    return data;
  },

  /**
   * Generates executive analytical reports for platform administrators
   */
  async generateReportSummary(
    reportType: 'sales' | 'inventory' | 'operational' | 'deliveries',
    timeRange?: string
  ): Promise<AIReportResponse> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${getBaseUrl()}/api/ai/report`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reportType, timeRange }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `AI report generation failed (${res.status})`);
    }
    return data;
  },

  /**
   * Generates high-converting marketing descriptions for seller products
   */
  async generateProductCopy(prompt: string, storeId?: string): Promise<AICopywritingResponse> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${getBaseUrl()}/api/ai/copywriting`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt, storeId }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `AI copywriting request failed (${res.status})`);
    }
    return data;
  },
};
