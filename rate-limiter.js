/**
 * Rate Limiter - Prevent hitting API rate limits
 *
 * Features:
 * - Token bucket algorithm for rate limiting
 * - Per-provider rate limits
 * - Automatic retry with exponential backoff
 * - Queue management for concurrent requests
 */

export class RateLimiter {
  constructor(config = {}) {
    // Default rate limits per provider (requests per minute)
    this.limits = {
      glm: config.glm || 60,           // GLM: 60 req/min
      featherless: config.featherless || 100, // Featherless: 100 req/min
      google: config.google || 60,     // Google: 60 req/min (free tier)
      anthropic: config.anthropic || 50, // Anthropic: 50 req/min
      ...config.custom
    };

    // Token buckets per provider
    this.buckets = {};
    this.queues = {};
    this.lastRefill = {};

    // Initialize buckets
    for (const provider in this.limits) {
      this.buckets[provider] = this.limits[provider];
      this.queues[provider] = [];
      this.lastRefill[provider] = Date.now();
    }
  }

  /**
   * Refill token bucket based on time elapsed
   */
  refillTokens(provider) {
    const now = Date.now();
    const elapsed = (now - this.lastRefill[provider]) / 1000; // seconds
    const tokensToAdd = (elapsed / 60) * this.limits[provider]; // tokens per minute

    this.buckets[provider] = Math.min(
      this.limits[provider],
      this.buckets[provider] + tokensToAdd
    );
    this.lastRefill[provider] = now;
  }

  /**
   * Check if request can proceed (has available token)
   */
  canProceed(provider) {
    this.refillTokens(provider);
    return this.buckets[provider] >= 1;
  }

  /**
   * Consume a token for this provider
   */
  consumeToken(provider) {
    if (!this.buckets[provider]) {
      this.buckets[provider] = this.limits[provider] || 60;
    }
    this.buckets[provider] -= 1;
  }

  /**
   * Wait for token availability with timeout
   * Returns Promise that resolves when token is available or rejects on timeout
   */
  async waitForToken(provider, timeoutMs = 60000) {
    const startTime = Date.now();

    while (!this.canProceed(provider)) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Rate limit timeout for ${provider} after ${timeoutMs}ms`);
      }

      // Calculate wait time until next token
      const tokensPerMs = this.limits[provider] / 60000;
      const waitTime = Math.ceil(1 / tokensPerMs);

      await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 1000)));
    }

    this.consumeToken(provider);
  }

  /**
   * Get current status for provider
   */
  getStatus(provider) {
    this.refillTokens(provider);
    return {
      provider,
      available: Math.floor(this.buckets[provider]),
      limit: this.limits[provider],
      percentage: Math.floor((this.buckets[provider] / this.limits[provider]) * 100)
    };
  }

  /**
   * Get status for all providers
   */
  getAllStatus() {
    const status = {};
    for (const provider in this.buckets) {
      status[provider] = this.getStatus(provider);
    }
    return status;
  }
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 60000,
    factor = 2,
    onRetry = null
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      // Check if error is rate limit (429)
      const isRateLimit = error.message?.includes('429') ||
                          error.message?.includes('rate limit') ||
                          error.message?.includes('quota exceeded');

      // Check if error is retryable
      const isRetryable = isRateLimit ||
                          error.message?.includes('timeout') ||
                          error.message?.includes('ECONNRESET') ||
                          error.code === 'ETIMEDOUT';

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Calculate backoff delay (longer for rate limits)
      if (isRateLimit) {
        delay = Math.min(delay * factor * 2, maxDelay); // 2x longer for rate limits
      } else {
        delay = Math.min(delay * factor, maxDelay);
      }

      // Call retry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, delay, error);
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Parse retry-after header from 429 response
 */
export function parseRetryAfter(headers) {
  const retryAfter = headers['retry-after'] || headers['Retry-After'];

  if (!retryAfter) {
    return null;
  }

  // If it's a number, it's seconds
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000; // Convert to ms
  }

  // If it's a date, calculate ms until then
  const retryDate = new Date(retryAfter);
  if (!isNaN(retryDate.getTime())) {
    return Math.max(0, retryDate.getTime() - Date.now());
  }

  return null;
}
