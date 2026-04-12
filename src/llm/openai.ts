import OpenAI from 'openai'
import { ChatResult, LLMProvider, Message } from './base'

const MEMO_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'update_user_memo',
    description:
      'ユーザーについて記憶すべき重要な情報を検知したときに呼ぶ。名前・職業・学校・継続的な好み嫌い・重要な出来事・対話のトーン変化などが対象。「今日は眠い」などの一時的な状態は呼ばない。',
    parameters: {
      type: 'object',
      properties: {
        info: {
          type: 'string',
          description: '記録する内容（自然言語、100字以内）',
        },
      },
      required: ['info'],
    },
  },
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai'
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  async chat(messages: Message[], systemPrompt: string): Promise<ChatResult> {
    const res = await this.client.chat.completions.create({
      model: 'gpt-5.4-nano',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools: [MEMO_TOOL],
    })

    const choice = res.choices[0]
    const msg = choice.message
    let text = msg.content ?? ''
    let memoAppend: string | undefined

    // tool_calls の処理
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fn = (tc as any).function as { name: string; arguments: string } | undefined
        if (fn?.name === 'update_user_memo') {
          const args = JSON.parse(fn.arguments) as { info?: string }
          if (args.info) memoAppend = args.info
        }
      }

      // tool_call のみでテキストが空の場合は再度テキストを要求
      if (!text && memoAppend) {
        const toolResults: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: 'assistant', content: null, tool_calls: msg.tool_calls },
          ...msg.tool_calls.map((tc) => ({
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: 'ok',
          })),
        ]

        const followUp = await this.client.chat.completions.create({
          model: 'gpt-5.4-nano',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
            ...toolResults,
          ],
          tools: [MEMO_TOOL],
        })
        text = followUp.choices[0].message.content ?? ''
      }
    }

    return { text, memoAppend }
  }
}
