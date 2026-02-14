export async function saveClaudeApiKey(apiKey) {
  return window.aiBridge.setClaudeApiKey(apiKey);
}

export async function saveOpenAiApiKey(apiKey) {
  return window.aiBridge.setOpenAiApiKey(apiKey);
}

export async function saveGeminiApiKey(apiKey) {
  return window.aiBridge.setGeminiApiKey(apiKey);
}

export async function askAi(provider, message, drawing, options = {}) {
  return window.aiBridge.ask({ provider, message, drawing, ...options });
}
