= '';

/**
 * Centralized API utility for VibeForge.
 * Handles all fetch calls to /api/inquiry and /api/github/sync.
 * Implements defensive error handling, request/response logging, and retry logic.
 */

const defaultHeaders = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

const defaultOptions = {
  method: 'GET',
  headers: { ...defaultHeaders },
  credentials: 'same-origin',
};

const retryConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  retryableStatuses: [500, 502, 503, 504, 408, 429],
  retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'],
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(status, error) {
  if (error && retryConfig.retryableErrors.includes(error.code)) return true;
  if (status && retryConfig.retryableStatuses.includes(status)) return true;
  return false;
}

async function fetchWithRetry(url, options = {}, retries = retryConfig.maxRetries) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        if (i < retries - 1 && isRetryable(response.status)) {
          await sleep(retryConfig.retryDelay * (i + 1));
          continue;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `API Error: ${response.status} ${response.statusText}\n${JSON.stringify(errorData)}`
        );
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (i < retries - 1 && isRetryable(error.status, error)) {
        await sleep(retryConfig.retryDelay * (i + 1));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError;
}

function buildUrl(endpoint) {
  return `${BASE_URL}${endpoint}`;
}

function buildOptions(method = 'GET', body = null, headers = {}) {
  const options = {
    ...defaultOptions,
    method,
    headers: { ...defaultHeaders, ...headers },
  };
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }
  return options;
}

/**
 * Submit a shopping cart inquiry.
 * @param {Object} inquiryData - { items: Array, total: Number, user: Object }
 * @returns {Promise<Object>} API response
 */
async function submitInquiry(inquiryData) {
  const url = buildUrl('/api/inquiry');
  const options = buildOptions('POST', inquiryData);
  return fetchWithRetry(url, options);
}

/**
 * Fetch GitHub sync status and trigger sync if needed.
 * @param {Object} params - Optional query parameters
 * @returns {Promise<Object>} API response
 */
async function syncGitHub(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = buildUrl(`/api/github/sync${queryString ? `?${queryString}` : ''}`);
  const options = buildOptions('GET');
  return fetchWithRetry(url, options);
}

/**
 * Health check endpoint.
 * @returns {Promise<Object>} API response
 */
async function healthCheck() {
  const url = buildUrl('/api/health');
  const options = buildOptions('GET');
  return fetchWithRetry(url, options);
}

module.exports = {
  submitInquiry,
  syncGitHub,
  healthCheck,
  fetchWithRetry,
  buildUrl,
  buildOptions,
};