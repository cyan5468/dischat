import { GoogleGenAI, Type } from '@google/genai'
import { ChatResult, LLMProvider, Message } from './base'

const MEMO_TOOL = {
  functionDeclarations: [
    {
      name: 'update_user_memo',
      description:
        'ユーザーについて記憶すべき重要な情報を検知したときに呼ぶ。名前・職業・学校・継続的な好み嫌い・重要な出来事・対話のトーン変化などが対象。「今日は眠い」などの一時的な状態は呼ばない。',
      parameters: {
        type: Type.OBJECT,
        properties: {
          info: {
            type: Type.STRING,
            description: '記録する内容（自然言語、100字以内）',
          },
        },
        required: ['info'],
      },
    },
  ],
}

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini'
  private client: GoogleGenAI

  constructor() {
    this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' })
  }

  async chat(messages: Message[], systemPrompt: string): Promise<ChatResult> {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) return { text: '' }

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }))

    const chatSession = this.client.chats.create({
      model: 'gemini-3.1-flash-lite-preview',
      config: {
        systemInstruction: systemPrompt,
        tools: [MEMO_TOOL],
      },
      history,
    })

    const response = await chatSession.sendMessage({ message: lastMessage.content })

    let text = response.text ?? ''
    let memoAppend: string | undefined

    // function call の処理
    const parts = response.candidates?.[0]?.content?.parts ?? []
    for (const part of parts) {
      if (part.functionCall?.name === 'update_user_memo') {
        const args = part.functionCall.args as { info?: string }
        if (args.info) memoAppend = args.info
      }
    }

    // function_call のみでテキストが空の場合は tool result を返して続きを取得
    if (!text && memoAppend) {
      const followUp = await chatSession.sendMessage({
        message: [
          {
            functionResponse: {
              name: 'update_user_memo',
              response: { result: 'ok' },
            },
          },
        ],
      })
      text = followUp.text ?? ''
    }

    return { text, memoAppend }
  }
}
