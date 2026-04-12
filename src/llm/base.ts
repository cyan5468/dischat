export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  text: string
  memoAppend?: string // LLM が update_user_memo ツールを呼んだ場合に入る
}

export interface LLMProvider {
  readonly name: string
  chat(messages: Message[], systemPrompt: string): Promise<ChatResult>
}
