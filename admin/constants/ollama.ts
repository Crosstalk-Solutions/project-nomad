import { NomadOllamaModel } from '../types/ollama.js'

/**
 * Fallback basic recommended Ollama models in case fetching from the service fails.
 */
export const FALLBACK_RECOMMENDED_OLLAMA_MODELS: NomadOllamaModel[] = [
  {
    name: 'llama3.1',
    description:
      'Llama 3.1 is a new state-of-the-art model from Meta available in 8B, 70B and 405B parameter sizes.',
    estimated_pulls: '109.3M',
    id: '9fe9c575-e77e-4a51-a743-07359458ee71',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '1 year ago',
    tags: [
      {
        name: 'llama3.1:8b-text-q4_1',
        size: '5.1 GB',
        context: '128k',
        input: 'Text',
        cloud: false,
        thinking: false
      },
    ],
  },
  {
    name: 'deepseek-r1',
    description:
      'DeepSeek-R1 is a family of open reasoning models with performance approaching that of leading models, such as O3 and Gemini 2.5 Pro.',
    estimated_pulls: '77.2M',
    id: '0b566560-68a6-4964-b0d4-beb3ab1ad694',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '7 months ago',
    tags: [
      {
        name: 'deepseek-r1:1.5b',
        size: '1.1 GB',
        context: '128k',
        input: 'Text',
        cloud: false,
        thinking: true
      },
    ],
  },
  {
    name: 'llama3.2',
    description: "Meta's Llama 3.2 goes small with 1B and 3B models.",
    estimated_pulls: '54.7M',
    id: 'c9a1bc23-b290-4501-a913-f7c9bb39c3ad',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '1 year ago',
    tags: [
      {
        name: 'llama3.2:1b-text-q2_K',
        size: '581 MB',
        context: '128k',
        input: 'Text',
        cloud: false,
        thinking: false
      },
    ],
  },
]

export const SYSTEM_PROMPTS = {
  default: `
 Format all responses using markdown for better readability. Vanilla markdown or GitHub-flavored markdown is preferred.
 - Use **bold** and *italic* for emphasis.
 - Use code blocks with language identifiers for code snippets.
 - Use headers (##, ###) to organize longer responses.
 - Use bullet points or numbered lists for clarity.
 - Use tables when presenting structured data.
`,
  rag_context: (context: string) => `
You have access to relevant information from the knowledge base. This context has been retrieved based on semantic similarity to the user's question.

[Knowledge Base Context]
${context}

IMPORTANT INSTRUCTIONS:
1. If the user's question is directly related to the context above, use this information to provide accurate, detailed answers.
2. Always cite or reference the context when using it (e.g., "According to the information available..." or "Based on the knowledge base...").
3. If the context is only partially relevant, combine it with your general knowledge but be clear about what comes from the knowledge base.
4. If the context is not relevant to the user's question, you can respond using your general knowledge without forcing the context into your answer.
5. Never fabricate information that isn't in the context or your training data.
6. If you're unsure or the context doesn't contain enough information, acknowledge the limitations.

Format your response using markdown for readability.
`,
  chat_suggestions: `
You are a helpful assistant that generates conversation starter suggestions for a survivalist/prepper using an AI assistant.

Provide exactly 3 conversation starter topics as direct questions that someone would ask.
These should be clear, complete questions that can start meaningful conversations.

Examples of good suggestions:
- "How do I purify water in an emergency?"
- "What are the best foods for long-term storage?"
- "Help me create a 72-hour emergency kit"

Do NOT use:
- Follow-up questions seeking clarification
- Vague or incomplete suggestions
- Questions that assume prior context
- Statements that are not suggestions themselves, such as praise for asking the question
- Direct questions or commands to the user

Return ONLY the 3 suggestions as a comma-separated list with no additional text, formatting, numbering, or quotation marks.
The suggestions should be in title case.
Ensure that your suggestions are comma-seperated with no conjunctions like "and" or "or".
Do not use line breaks, new lines, or extra spacing to separate the suggestions.
Format: suggestion1, suggestion2, suggestion3
`,
  query_rewrite: `
You are a query rewriting assistant. Your task is to reformulate the user's latest question to include relevant context from the conversation history.

Given the conversation history, rewrite the user's latest question to be a standalone, context-aware search query that will retrieve the most relevant information.

Rules:
1. Keep the rewritten query concise (under 150 words)
2. Include key entities, topics, and context from previous messages
3. Make it a clear, searchable query
4. Do NOT answer the question - only rewrite the user's query to be more effective for retrieval
5. Output ONLY the rewritten query, nothing else

Examples:

Conversation:
User: "How do I install Gentoo?"
Assistant: [detailed installation guide]
User: "Is an internet connection required to install?"

Rewritten Query: "Is an internet connection required to install Gentoo Linux?"

---

Conversation:
User: "What's the best way to preserve meat?"
Assistant: [preservation methods]
User: "How long does it last?"

Rewritten Query: "How long does preserved meat last using curing or smoking methods?"
`,
}
