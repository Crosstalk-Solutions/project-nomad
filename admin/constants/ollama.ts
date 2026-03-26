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
        thinking: false,
      },
    ],
  },
  {
    name: 'deepseek-r1',
    description:
      'DeepSeek-R1 is a family of open reasoning models with performance approaching that of leading models.',
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
        thinking: true,
      },
      {
        name: 'deepseek-r1:8b',
        size: '4.9 GB',
        context: '128k',
        input: 'Text',
        cloud: false,
        thinking: true,
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
        thinking: false,
      },
      {
        name: 'llama3.2:3b',
        size: '2.0 GB',
        context: '128k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
    ],
  },
  {
    name: 'mistral',
    description:
      'Mistral 7B is a compact yet powerful language model by Mistral AI, great for general-purpose tasks.',
    estimated_pulls: '26.8M',
    id: 'a2b3c4d5-e6f7-4890-abcd-ef1234567890',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '6 months ago',
    tags: [
      {
        name: 'mistral:7b',
        size: '4.1 GB',
        context: '32k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
    ],
  },
  {
    name: 'gemma2',
    description:
      'Gemma 2 is a family of lightweight, state-of-the-art open models by Google.',
    estimated_pulls: '18.5M',
    id: 'b3c4d5e6-f7a8-4901-bcde-f12345678901',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '8 months ago',
    tags: [
      {
        name: 'gemma2:2b',
        size: '1.6 GB',
        context: '8k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
      {
        name: 'gemma2:9b',
        size: '5.4 GB',
        context: '8k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
    ],
  },
  {
    name: 'phi3',
    description:
      'Phi-3 is a family of small language models developed by Microsoft with strong reasoning capabilities.',
    estimated_pulls: '12.4M',
    id: 'c4d5e6f7-a8b9-4012-cdef-123456789012',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '10 months ago',
    tags: [
      {
        name: 'phi3:mini',
        size: '2.3 GB',
        context: '128k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
    ],
  },
  {
    name: 'codellama',
    description:
      'Code Llama is a model for generating and discussing code, built on top of Llama 2.',
    estimated_pulls: '15.2M',
    id: 'd5e6f7a8-b9c0-4123-defa-234567890123',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '1 year ago',
    tags: [
      {
        name: 'codellama:7b',
        size: '3.8 GB',
        context: '16k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
    ],
  },
  {
    name: 'qwen2.5-coder',
    description:
      'Qwen2.5-Coder is a series of code-specific large language models by Alibaba Cloud.',
    estimated_pulls: '9.7M',
    id: 'e6f7a8b9-c0d1-4234-efab-345678901234',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '4 months ago',
    tags: [
      {
        name: 'qwen2.5-coder:3b',
        size: '1.9 GB',
        context: '32k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
      {
        name: 'qwen2.5-coder:7b',
        size: '4.7 GB',
        context: '32k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
    ],
  },
  {
    name: 'tinyllama',
    description:
      'TinyLlama is a compact 1.1B language model ideal for resource-constrained environments.',
    estimated_pulls: '5.3M',
    id: 'f7a8b9c0-d1e2-4345-fabc-456789012345',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '1 year ago',
    tags: [
      {
        name: 'tinyllama:1.1b',
        size: '638 MB',
        context: '2k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
    ],
  },
  {
    name: 'nomic-embed-text',
    description:
      'A high-performing open embedding model with a large token context window.',
    estimated_pulls: '22.1M',
    id: 'a8b9c0d1-e2f3-4456-abcd-567890123456',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '9 months ago',
    tags: [
      {
        name: 'nomic-embed-text:latest',
        size: '274 MB',
        context: '8k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
    ],
  },
  {
    name: 'qwen2.5',
    description:
      'Qwen2.5 is a series of large language models by Alibaba Cloud with strong multilingual support.',
    estimated_pulls: '14.6M',
    id: 'b9c0d1e2-f3a4-4567-bcde-678901234567',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '5 months ago',
    tags: [
      {
        name: 'qwen2.5:3b',
        size: '1.9 GB',
        context: '32k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
      {
        name: 'qwen2.5:7b',
        size: '4.7 GB',
        context: '32k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
    ],
  },
  {
    name: 'llava',
    description:
      'LLaVA is a multimodal model that combines a vision encoder with Vicuna for visual and language understanding.',
    estimated_pulls: '8.9M',
    id: 'c0d1e2f3-a4b5-4678-cdef-789012345678',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '1 year ago',
    tags: [
      {
        name: 'llava:7b',
        size: '4.7 GB',
        context: '4k',
        input: 'Text, Images',
        cloud: false,
        thinking: false,
      },
    ],
  },
  {
    name: 'starcoder2',
    description:
      'StarCoder2 is a family of code generation models trained on The Stack v2 dataset.',
    estimated_pulls: '3.8M',
    id: 'd1e2f3a4-b5c6-4789-defa-890123456789',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '1 year ago',
    tags: [
      {
        name: 'starcoder2:3b',
        size: '1.7 GB',
        context: '16k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
    ],
  },
  {
    name: 'dolphin-mistral',
    description:
      'Dolphin Mistral is an uncensored, fine-tuned Mistral model focused on helpfulness.',
    estimated_pulls: '4.2M',
    id: 'e2f3a4b5-c6d7-4890-efab-901234567890',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '1 year ago',
    tags: [
      {
        name: 'dolphin-mistral:7b',
        size: '4.1 GB',
        context: '32k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
    ],
  },
  {
    name: 'phi3.5',
    description:
      'Phi-3.5 is an updated small language model by Microsoft with improved multilingual and reasoning capabilities.',
    estimated_pulls: '6.1M',
    id: 'f3a4b5c6-d7e8-4901-fabc-012345678901',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '8 months ago',
    tags: [
      {
        name: 'phi3.5:3.8b',
        size: '2.2 GB',
        context: '128k',
        input: 'Text',
        cloud: false,
        thinking: false,
      },
    ],
  },
]

export const DEFAULT_QUERY_REWRITE_MODEL = 'qwen2.5:3b' // default to qwen2.5 for query rewriting with good balance of text task performance and resource usage

/**
 * Adaptive RAG context limits based on model size.
 * Smaller models get overwhelmed with too much context, so we cap it.
 */
export const RAG_CONTEXT_LIMITS: { maxParams: number; maxResults: number; maxTokens: number }[] = [
  { maxParams: 3, maxResults: 2, maxTokens: 1000 },   // 1-3B models
  { maxParams: 8, maxResults: 4, maxTokens: 2500 },   // 4-8B models
  { maxParams: Infinity, maxResults: 5, maxTokens: 0 }, // 13B+ (no cap)
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
4. If the context is not relevant to the user's question, you can respond using your general knowledge without forcing the context into your answer. Do not mention the context if it's not relevant.
5. Never fabricate information that isn't in the context or your training data.
6. If you're unsure or you don't have enough information to answer the user's question, acknowledge the limitations.

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
  title_generation: `You are a title generator. Given the start of a conversation, generate a concise, descriptive title under 50 characters. Return ONLY the title text with no quotes, punctuation wrapping, or extra formatting.`,
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
