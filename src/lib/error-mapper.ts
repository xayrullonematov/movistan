/**
 * Error Message Mapper
 *
 * Converts raw API errors, HTTP status codes, and LLM provider errors
 * into user-friendly messages suitable for toast notifications.
 */

interface FriendlyError {
  title: string;
  description: string;
}

/**
 * Maps a raw error (from API response or catch block) to a friendly message.
 * Handles DashScope/Qwen-specific error codes, generic HTTP statuses, and
 * network errors.
 */
export function mapErrorToFriendly(error: unknown): FriendlyError {
  // Already a string message from the API body
  if (typeof error === "string") {
    return matchErrorMessage(error);
  }

  if (error instanceof Error) {
    return matchErrorMessage(error.message);
  }

  return { title: "Something went wrong", description: "Please try again in a moment." };
}

/**
 * Maps an API response status + optional error body to a friendly message.
 */
export function mapApiError(status: number, body?: { error?: string; code?: string; message?: string }): FriendlyError {
  const msg = body?.error ?? body?.message ?? "";

  // DashScope-specific error codes (from body)
  if (msg.includes("Arrearage") || msg.includes("good standing")) {
    return { title: "Account payment issue", description: "Your AI provider account has an overdue balance. Please check your billing." };
  }
  if (msg.includes("AllocationQuota") || msg.includes("exceeded your current quota") || msg.includes("insufficient_quota")) {
    return { title: "Token quota exhausted", description: "The AI model's usage limit has been reached. Please wait or upgrade your plan." };
  }
  if (msg.includes("RateQuota") || msg.includes("rate limit") || msg.includes("too many requests")) {
    return { title: "Too many requests", description: "The AI service is rate-limited. Please wait a moment and try again." };
  }
  if (msg.includes("DataInspectionFailed") || msg.includes("inappropriate content")) {
    return { title: "Content blocked", description: "The input or output was flagged by content moderation. Try rephrasing your problem description." };
  }
  if (msg.includes("InvalidApiKey") || msg.includes("Invalid API-key") || msg.includes("Incorrect API key")) {
    return { title: "Invalid API key", description: "The AI provider API key is misconfigured. Please check your settings." };
  }
  if (msg.includes("ModelNotFound") || msg.includes("Model can not be found") || msg.includes("does not exist")) {
    return { title: "Model unavailable", description: "The configured AI model was not found. Please check your model settings." };
  }
  if (msg.includes("Range of input length") || msg.includes("token length exceed")) {
    return { title: "Input too long", description: "Your problem description or context is too large for the model. Try shortening it." };
  }
  if (msg.includes("timed out") || msg.includes("timeout") || msg.includes("RequestTimeOut")) {
    return { title: "Request timed out", description: "The AI model took too long to respond. Please try again." };
  }

  // Generic HTTP status mapping
  switch (status) {
    case 400:
      return { title: "Invalid request", description: msg || "Something was wrong with the request. Please try again." };
    case 401:
      return { title: "Authentication failed", description: "The API key is invalid or expired. Check your settings." };
    case 403:
      return { title: "Access denied", description: "You don't have permission to use this model. Check your provider account." };
    case 404:
      return { title: "Not found", description: "The requested resource doesn't exist. It may have been deleted." };
    case 409:
      return { title: "Session busy", description: "Another round is already in progress. Please wait for it to finish." };
    case 429:
      return { title: "Too many requests", description: "The service is temporarily overloaded. Please wait and try again." };
    case 500:
    case 502:
    case 503:
      return { title: "Service temporarily unavailable", description: "The AI service is experiencing issues. Please try again in a moment." };
    default:
      return { title: "Something went wrong", description: msg || "An unexpected error occurred. Please try again." };
  }
}

function matchErrorMessage(msg: string): FriendlyError {
  const lower = msg.toLowerCase();

  if (lower.includes("fetch") || lower.includes("network") || lower.includes("econnrefused") || lower.includes("enotfound")) {
    return { title: "Connection failed", description: "Couldn't reach the AI service. Check your internet connection." };
  }
  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("aborted")) {
    return { title: "Request timed out", description: "The AI model took too long to respond. Please try again." };
  }
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("throttl")) {
    return { title: "Too many requests", description: "The service is rate-limited. Please wait a moment." };
  }
  if (lower.includes("quota") || lower.includes("insufficient")) {
    return { title: "Quota exhausted", description: "The AI model's usage limit has been reached." };
  }
  if (lower.includes("api key") || lower.includes("apikey") || lower.includes("unauthorized") || lower.includes("401")) {
    return { title: "Authentication error", description: "The API key is invalid. Check your settings." };
  }
  if (lower.includes("model") && (lower.includes("not found") || lower.includes("not exist"))) {
    return { title: "Model not found", description: "The configured model doesn't exist. Check your settings." };
  }
  if (lower.includes("budget") || lower.includes("over budget")) {
    return { title: "Token budget exceeded", description: "This session has used its allocated token budget." };
  }
  if (lower.includes("locked") || lower.includes("conflict") || lower.includes("409")) {
    return { title: "Session busy", description: "A round is already running. Wait for it to finish." };
  }
  if (lower.includes("validation failed")) {
    return { title: "AI response invalid", description: "The model produced an unreadable response. This usually resolves on retry." };
  }

  return { title: "Something went wrong", description: "An unexpected error occurred. Please try again." };
}
