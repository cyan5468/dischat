import { GoogleGenAI } from '@google/genai'
import { LLMProvider, Message } from './base'

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini'
  private client: GoogleGenAI

  constructor() {
    this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' })
  }

  async chat(messages: Message[], systemPrompt: string): Promise<string> {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) return ''

    // Gemini は history と最後のメッセージを分ける必要がある
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }))

    const chat = this.client.chats.create({
      model: 'gemini-3.1-flash-lite-preview',
      config: {
        systemInstruction: systemPrompt,
      },
      history,
    })

    const response = await chat.sendMessage({ message: lastMessage.content })
    return response.text ?? ''
  }
}
