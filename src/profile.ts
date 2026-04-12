import { LLMProvider, Message } from './llm/base'
import { appendMemoToProfile, getProfile, getUserTurnCount, upsertProfile } from './db'

const CONSOLIDATE_INTERVAL = 6 // N往復ごとに圧縮

// 即時トリガー: LLM が検知した情報を memo に追記
export function appendMemo(userId: string, displayName: string, info: string): void {
  appendMemoToProfile(userId, displayName, info)
}

// 事後トリガー: N往復ごとに会話全体を振り返り memo を圧縮・更新
export async function maybeConsolidateMemo(
  userId: string,
  displayName: string,
  channelId: string,
  recentMessages: Message[],
  provider: LLMProvider,
): Promise<void> {
  const turnCount = getUserTurnCount(userId, channelId)
  if (turnCount === 0 || turnCount % CONSOLIDATE_INTERVAL !== 0) return

  const profile = getProfile(userId)
  const currentMemo = profile?.memo ?? ''

  const conversationText = recentMessages
    .map((m) => `${m.role === 'user' ? displayName : 'Bot'}: ${m.content}`)
    .join('\n')

  const prompt = `以下はユーザー「${displayName}」との最近の会話です。
また、現在のメモは以下の通りです。

【現在のメモ】
${currentMemo || '（なし）'}

【最近の会話】
${conversationText}

上記をもとに、このユーザーについての認識を自然言語のナラティブとして200字程度にまとめてください。
以下の点を含めてください：
- 属性・背景（職業、環境、生活など）
- 継続的な関心・価値観・好み
- 重要な出来事・状況
- 対話から読み取れる距離感・関係性のトーン

一時的な状態（「今日は眠い」など）は含めないでください。
メモの本文のみを出力し、説明や前置きは不要です。`

  try {
    const result = await provider.chat(
      [{ role: 'user', content: prompt }],
      'あなたはユーザーの情報を整理するアシスタントです。',
    )
    const newMemo = result.text.trim()
    if (newMemo) {
      upsertProfile(userId, displayName, newMemo)
    }
  } catch (err) {
    console.error('❌ memo consolidation failed:', err)
  }
}
