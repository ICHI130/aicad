export async function saveClaudeApiKey(apiKey) {
  return window.aiBridge.setClaudeApiKey(apiKey);
}

export async function askAi(provider, message, drawing) {
  return window.aiBridge.ask({ provider, message, drawing });
}
