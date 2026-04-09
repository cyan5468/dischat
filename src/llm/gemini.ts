import { GoogleGenerativeAI } from '@google/generative-ai'
import { LLMProvider, Message } from './base'

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini'
  private genAI: GoogleGenerativeAI

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')
  }

  async chat(messages: Message[], systemPrompt: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      systemInstruction: systemPrompt,
    })

    // Gemini は history と最後のメッセージを分ける必要がある
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }))

    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) return ''

    const chat = model.startChat({ history })
    const result = await chat.sendMessage(lastMessage.content)
    return result.response.text()
  }
}
