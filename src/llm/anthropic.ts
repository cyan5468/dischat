import Anthropic from '@anthropic-ai/sdk'
import { ChatResult, LLMProvider, Message } from './base'

const MEMO_TOOL: Anthropic.Tool = {
  name: 'update_user_memo',
  description:
    'ユーザーについて記憶すべき重要な情報を検知したときに呼ぶ。名前・職業・学校・継続的な好み嫌い・重要な出来事・対話のトーン変化などが対象。「今日は眠い」などの一時的な状態は呼ばない。',
  input_schema: {
    type: 'object' as const,
    properties: {
      info: {
        type: 'string',
        description: '記録する内容（自然言語、100字以内）',
      },
    },
    required: ['info'],
  },
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic'
  private client: Anthropic

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  async chat(messages: Message[], systemPrompt: string): Promise<ChatResult> {
    const res = await this.client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      tools: [MEMO_TOOL],
    })

    let text = ''
    let memoAppend: string | undefined

    for (const block of res.content) {
      if (block.type === 'text') {
        text = block.text
      } else if (block.type === 'tool_use' && block.name === 'update_user_memo') {
        const input = block.input as { info?: string }
        if (input.info) memoAppend = input.info
      }
    }

    // tool_use のみで text が空の場合は再度テキストを要求
    if (!text && memoAppend) {
      const followUp = await this.client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...messages,
          { role: 'assistant', content: res.content },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: res.content.find((b) => b.type === 'tool_use')!.id,
                content: 'ok',
              },
            ],
          },
        ],
        tools: [MEMO_TOOL],
      })
      const textBlock = followUp.content.find((b) => b.type === 'text')
      text = textBlock?.type === 'text' ? textBlock.text : ''
    }

    return { text, memoAppend }
  }
}
