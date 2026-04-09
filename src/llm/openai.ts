import OpenAI from 'openai'
import { LLMProvider, Message } from './base'

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai'
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  async chat(messages: Message[], systemPrompt: string): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    })
    return res.choices[0].message.content ?? ''
  }
}
