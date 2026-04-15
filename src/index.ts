import 'dotenv/config'
import { DiscordBot } from './bot'
import { CharacterManager, loadCharacter } from './character'
import { getDb, setAutoReply } from './db'
import { OpenAIProvider } from './llm/openai'
import { AnthropicProvider } from './llm/anthropic'
import { GeminiProvider } from './llm/gemini'
import { LLMProvider } from './llm/base'

function createProvider(name: string): LLMProvider {
  switch (name.toLowerCase()) {
    case 'anthropic':
      return new AnthropicProvider()
    case 'openai':
      return new OpenAIProvider()
    case 'gemini':
      return new GeminiProvider()
    default:
      throw new Error(`Unknown provider: "${name}". Valid options: anthropic, openai, gemini`)
  }
}

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN
  if (!token) throw new Error('DISCORD_TOKEN is not set')

  // DB 初期化（テーブル作成）
  getDb()
  console.log('✅ Database initialized')

  const providerName = process.env.DEFAULT_PROVIDER ?? 'anthropic'
  const provider = createProvider(providerName)
  console.log(`🤖 Provider: ${providerName}`)

  const defaultCharacter = loadCharacter('default')
  const characterManager = new CharacterManager(defaultCharacter)
  console.log(`🎭 Default character: ${defaultCharacter.name}`)

  // AUTO_REPLY_CHANNELS 環境変数からDBへシード（初回起動時や変更時に反映）
  const seedChannels = (process.env.AUTO_REPLY_CHANNELS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const channelId of seedChannels) {
    setAutoReply(channelId, true)
  }

  if (seedChannels.length > 0) {
    console.log(`📢 Auto-reply channels seeded: ${seedChannels.join(', ')}`)
  }

  const bot = new DiscordBot({
    provider,
    characterManager,
  })

  await bot.login(token)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
