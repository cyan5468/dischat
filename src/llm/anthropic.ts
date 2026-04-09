import Anthropic from '@anthropic-ai/sdk'
import { LLMProvider, Message } from './base'

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic'
  private client: Anthropic

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  async chat(messages: Message[], systemPrompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    })
    const block = res.content[0]
    return block.type === 'text' ? block.text : ''
  }
}
