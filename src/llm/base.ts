export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMProvider {
  readonly name: string
  chat(messages: Message[], systemPrompt: string): Promise<string>
}
