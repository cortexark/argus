/**
 * Known AI applications and their process names
 * Used to identify and label AI app activity
 */
export const AI_APPS = {
  // Claude — CLI binary is 'claude', desktop app is 'Claude'
  'claude': { name: 'Claude Code (CLI)', category: 'AI Code Editor' },
  'Claude': { name: 'Claude Desktop', category: 'LLM Desktop' },

  // OpenAI Codex CLI
  'codex': { name: 'OpenAI Codex (CLI)', category: 'AI Code Editor' },

  // Cursor
  'cursor': { name: 'Cursor AI Editor', category: 'AI Code Editor' },
  'Cursor': { name: 'Cursor AI Editor', category: 'AI Code Editor' },

  // ChatGPT
  'ChatGPT': { name: 'ChatGPT (OpenAI)', category: 'LLM Desktop' },
  'chatgpt': { name: 'ChatGPT (OpenAI)', category: 'LLM Desktop' },

  // GitHub Copilot (in VS Code)
  'Code': { name: 'VS Code / Copilot', category: 'AI Code Editor' },
  'code': { name: 'VS Code / Copilot', category: 'AI Code Editor' },

  // Windsurf
  'windsurf': { name: 'Windsurf (Codeium)', category: 'AI Code Editor' },
  'Windsurf': { name: 'Windsurf (Codeium)', category: 'AI Code Editor' },

  // Ollama (local LLMs)
  'ollama': { name: 'Ollama (Local LLM)', category: 'Local LLM' },

  // LM Studio
  'LM Studio': { name: 'LM Studio', category: 'Local LLM' },
  'lmstudio': { name: 'LM Studio', category: 'Local LLM' },

  // Continue.dev
  'continue': { name: 'Continue.dev', category: 'AI Code Editor' },

  // Perplexity
  'Perplexity': { name: 'Perplexity AI', category: 'LLM Desktop' },

  // Copilot standalone
  'copilot': { name: 'GitHub Copilot', category: 'AI Assistant' },

  // Tabnine
  'tabnine': { name: 'Tabnine', category: 'AI Code Editor' },

  // Amazon Q
  'amazonq': { name: 'Amazon Q', category: 'AI Assistant' },
  'Amazon Q': { name: 'Amazon Q', category: 'AI Assistant' },

  // Node.js (could be running AI agents)
  'node': { name: 'Node.js process (may be AI agent)', category: 'Runtime' },
  'python3': { name: 'Python (may be AI agent)', category: 'Runtime' },
  'python': { name: 'Python (may be AI agent)', category: 'Runtime' },
};

/**
 * Sensitive paths that should trigger alerts when accessed by AI apps
 */
export const SENSITIVE_PATHS = {
  credentials: [
    '/Library/Keychains',
    'Library/Keychains',
    '.ssh',
    '.aws',
    '.gnupg',
    '.netrc',
    '.npmrc',
    '.pypirc',
    'Library/Application Support/1Password',
    'Library/Application Support/Bitwarden',
    'Library/Application Support/LastPass',
  ],
  browserData: [
    'Library/Application Support/Google/Chrome',
    'Library/Application Support/BraveSoftware/Brave-Browser',
    'Library/Application Support/Firefox',
    'Library/Safari',
    'Library/Application Support/Microsoft Edge',
    'Library/Application Support/Arc',
  ],
  documents: [
    '/Documents',
    '/Downloads',
    '/Desktop',
  ],
  system: [
    '/etc/passwd',
    '/etc/hosts',
    '/.env',
    '.env',
  ],
};

/**
 * Known safe/system ports (not flagged)
 */
export const COMMON_PORTS = new Set([
  80, 443, 53, 22, 25, 587, 993, 995,
  8080, 8443, 3000, 4000, 5000,
  5432, 3306, 27017, 6379,
]);

/**
 * Known AI service endpoints
 */
export const AI_ENDPOINTS = [
  { pattern: 'api.anthropic.com', service: 'Anthropic Claude API' },
  { pattern: 'api.openai.com', service: 'OpenAI API' },
  { pattern: 'api.cohere.com', service: 'Cohere API' },
  { pattern: 'generativelanguage.googleapis.com', service: 'Google Gemini API' },
  { pattern: 'api.mistral.ai', service: 'Mistral AI API' },
  { pattern: 'api.together.xyz', service: 'Together AI' },
  { pattern: 'openrouter.ai', service: 'OpenRouter' },
  { pattern: 'huggingface.co', service: 'Hugging Face' },
  { pattern: 'replicate.com', service: 'Replicate' },
  { pattern: 'perplexity.ai', service: 'Perplexity AI' },
  { pattern: 'cursor.sh', service: 'Cursor AI' },
  { pattern: 'codeium.com', service: 'Codeium/Windsurf' },
  { pattern: 'copilot.github.com', service: 'GitHub Copilot' },
  { pattern: 'githubcopilot.com', service: 'GitHub Copilot' },
];
