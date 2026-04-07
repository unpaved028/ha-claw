/**
 * types.ts – Shared types for the agentic loop and OpenRouter integration.
 */

// ── Chat Messages (OpenAI-compatible format) ─────────────────

export interface SystemMessage {
  role: 'system';
  content: string;
}

export interface UserMessage {
  role: 'user';
  content: string;
}

export interface AssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface ToolResultMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

export type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage;

// ── Tool Calling ─────────────────────────────────────────────

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// ── OpenRouter API ───────────────────────────────────────────

export interface OpenRouterRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none';
  max_tokens?: number;
  temperature?: number;
}

export interface OpenRouterResponse {
  id: string;
  choices: {
    message: AssistantMessage;
    finish_reason: 'stop' | 'tool_calls' | 'length';
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ── Agent Config ─────────────────────────────────────────────

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// ── Loop Result ──────────────────────────────────────────────

export interface LoopResult {
  response: string;
  iterations: number;
  toolCalls: { name: string; result: string }[];
}

// ── Progress Events (SSE / Real-time Streaming Feedback) ────

export interface ProgressEvent {
  /** 'thinking' = LLM is reasoning; 'tool_call' = tool being invoked; 'tool_result' = tool returned; 'text_chunk' = LLM streaming text */
  type: 'thinking' | 'tool_call' | 'tool_result' | 'text_chunk';
  /** Human-readable status message (for 'thinking' events) */
  message?: string;
  /** Tool name (for 'tool_call' / 'tool_result' events) */
  toolName?: string;
  /** Streamed text chunk (for 'text_chunk' events) */
  chunk?: string;
  /** Current iteration number */
  iteration?: number;
  /** Index signature for JSON serialization */
  [key: string]: unknown;
}

export type ProgressCallback = (event: ProgressEvent) => void;
