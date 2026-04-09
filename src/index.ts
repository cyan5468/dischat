import 'dotenv/config'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DiscordBot } from './bot'
import { AnthropicProvider } from './llm/anthropic'
import { OpenAIProvider } from './llm/openai'
import { GeminiProvider } from './llm/gemini'
import { LLMProvider } from './llm/base'

interface Character {
  name: string
  systemPrompt: string
}

function loadCharacter(name = 'default'): Character {
  const path = join(process.cwd(), 'characters', `${name}.json`)
  const raw = readFileSync(path, 'utf-8')
  return JSON.parse(raw) as Character
}

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

  const providerName = process.env.DEFAULT_PROVIDER ?? 'anthropic'
  const provider = createProvider(providerName)
  console.log(`🤖 Provider: ${providerName}`)

  const character = loadCharacter()
  console.log(`🎭 Character: ${character.name}`)

  const autoReplyChannels = new Set(
    (process.env.AUTO_REPLY_CHANNELS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )

  if (autoReplyChannels.size > 0) {
    console.log(`📢 Auto-reply channels: ${[...autoReplyChannels].join(', ')}`)
  }

  const bot = new DiscordBot({
    provider,
    systemPrompt: character.systemPrompt,
    autoReplyChannels,
  })

  await bot.login(token)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
