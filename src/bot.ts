import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Message as DiscordMessage,
  ChannelType,
} from 'discord.js'
import { LLMProvider } from './llm/base'
import { CharacterManager, listCharacters } from './character'
import {
  addMessage,
  clearChannelHistory,
  deleteUserData,
  getHistory,
  getProfile,
  upsertProfile,
} from './db'
import { appendMemo, maybeConsolidateMemo } from './profile'

const MAX_HISTORY = 20
const DISCORD_MAX_LENGTH = 2000

export interface BotConfig {
  provider: LLMProvider
  characterManager: CharacterManager
  autoReplyChannels: Set<string>
}

export class DiscordBot {
  private client: Client
  private config: BotConfig

  constructor(config: BotConfig) {
    this.config = config
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message],
    })

    this.setupEvents()
  }

  private setupEvents(): void {
    this.client.once(Events.ClientReady, (c) => {
      console.log(`✅ Ready! Logged in as ${c.user.tag}`)
      void this.registerCommands(c.user.id)
    })

    this.client.on(Events.MessageCreate, (msg) => void this.handleMessage(msg))

    this.client.on(Events.InteractionCreate, (interaction) => {
      if (interaction.isChatInputCommand()) {
        void this.handleCommand(interaction)
      }
    })
  }

  private async registerCommands(clientId: string): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName('clear')
        .setDescription('このチャンネルの会話履歴をクリアする')
        .toJSON(),
      new SlashCommandBuilder()
        .setName('autoreply')
        .setDescription('メンション不要で自動返答するチャンネルを管理する')
        .addSubcommand((sub) =>
          sub.setName('add').setDescription('このチャンネルを自動返答対象に追加する'),
        )
        .addSubcommand((sub) =>
          sub.setName('remove').setDescription('このチャンネルを自動返答対象から外す'),
        )
        .addSubcommand((sub) =>
          sub.setName('list').setDescription('自動返答対象のチャンネル一覧を表示する'),
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName('forget')
        .setDescription('自分のプロファイルと会話履歴をすべて削除する')
        .toJSON(),
      new SlashCommandBuilder()
        .setName('character')
        .setDescription('ボットのキャラクターを管理する')
        .addSubcommand((sub) =>
          sub.setName('list').setDescription('利用可能なキャラクター一覧を表示する'),
        )
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('このチャンネルのキャラクターを変更する（履歴もリセット）')
            .addStringOption((opt) =>
              opt.setName('name').setDescription('キャラクター名').setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub.setName('current').setDescription('現在のキャラクターを表示する'),
        )
        .toJSON(),
    ]

    const rest = new REST().setToken(process.env.DISCORD_TOKEN!)
    try {
      await rest.put(Routes.applicationCommands(clientId), { body: commands })
      console.log('✅ Slash commands registered globally')
    } catch (err) {
      console.error('❌ Failed to register slash commands:', err)
    }
  }

  private buildSystemPrompt(channelId: string, displayName: string, userId: string): string {
    const character = this.config.characterManager.getCharacter(channelId)
    const profile = getProfile(userId)
    const memo = profile?.memo?.trim()

    if (!memo) return character.systemPrompt

    return `${character.systemPrompt}

---
${displayName}についての認識:
${memo}
---`
  }

  private async handleMessage(msg: DiscordMessage): Promise<void> {
    if (msg.author.bot) return

    const isDM = msg.channel.type === ChannelType.DM
    const isAutoReply = this.config.autoReplyChannels.has(msg.channelId)
    const isMentioned = this.client.user
      ? msg.mentions.users.has(this.client.user.id)
      : false

    if (!isDM && !isAutoReply && !isMentioned) return

    let content = msg.content
    if (isMentioned) {
      content = content.replace(/<@!?\d+>/g, '').trim()
    }
    if (!content) return

    if (!('sendTyping' in msg.channel)) return
    const channel = msg.channel as {
      sendTyping(): Promise<void>
      send(content: string): Promise<unknown>
    }

    const userId = msg.author.id
    const displayName = msg.member?.displayName ?? msg.author.displayName
    const channelId = msg.channelId

    // プロファイルが未作成なら初期化
    if (!getProfile(userId)) {
      upsertProfile(userId, displayName, '')
    }

    await channel.sendTyping()

    // DBから履歴を取得
    const historyRows = getHistory(channelId, MAX_HISTORY)
    const messages = historyRows.map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }))

    // ユーザー発言を追加
    messages.push({ role: 'user', content })
    addMessage(userId, channelId, 'user', content)

    const systemPrompt = this.buildSystemPrompt(channelId, displayName, userId)

    try {
      const result = await this.config.provider.chat(messages, systemPrompt)

      // 即時memoトリガー
      if (result.memoAppend) {
        appendMemo(userId, displayName, result.memoAppend)
        console.log(`📝 memo updated for ${displayName}: ${result.memoAppend}`)
      }

      // アシスタント応答をDBに保存
      addMessage(userId, channelId, 'assistant', result.text)

      // 事後memoトリガー（6往復ごと）
      void maybeConsolidateMemo(
        userId,
        displayName,
        channelId,
        messages.concat([{ role: 'assistant', content: result.text }]),
        this.config.provider,
      )

      // 送信
      if (result.text.length <= DISCORD_MAX_LENGTH) {
        await msg.reply(result.text)
      } else {
        const chunks =
          result.text.match(new RegExp(`.{1,${DISCORD_MAX_LENGTH}}`, 'gs')) ?? [result.text]
        for (const chunk of chunks) {
          await channel.send(chunk)
        }
      }
    } catch (err) {
      console.error('❌ LLM error:', err)
      // エラー時はユーザー発言をDBから削除
      // （簡易対応: 最後に追加した行を消すのは難しいため、ログのみ）
      await msg.reply('エラーが発生しました。しばらくしてからもう一度お試しください。')
    }
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const { commandName, channelId } = interaction

    if (commandName === 'clear') {
      clearChannelHistory(channelId)
      await interaction.reply({ content: '🗑️ 会話履歴をクリアしました！', ephemeral: true })
      return
    }

    if (commandName === 'autoreply') {
      const sub = interaction.options.getSubcommand()

      if (sub === 'add') {
        if (this.config.autoReplyChannels.has(channelId)) {
          await interaction.reply({
            content: 'このチャンネルはすでに自動返答対象です。',
            ephemeral: true,
          })
        } else {
          this.config.autoReplyChannels.add(channelId)
          await interaction.reply({
            content: `✅ <#${channelId}> を自動返答対象に追加しました。`,
            ephemeral: true,
          })
        }
      } else if (sub === 'remove') {
        if (!this.config.autoReplyChannels.has(channelId)) {
          await interaction.reply({
            content: 'このチャンネルは自動返答対象ではありません。',
            ephemeral: true,
          })
        } else {
          this.config.autoReplyChannels.delete(channelId)
          await interaction.reply({
            content: `🗑️ <#${channelId}> を自動返答対象から外しました。`,
            ephemeral: true,
          })
        }
      } else if (sub === 'list') {
        if (this.config.autoReplyChannels.size === 0) {
          await interaction.reply({
            content: '自動返答対象のチャンネルはありません。',
            ephemeral: true,
          })
        } else {
          const list = [...this.config.autoReplyChannels].map((id) => `<#${id}>`).join('\n')
          await interaction.reply({
            content: `📋 自動返答対象チャンネル:\n${list}`,
            ephemeral: true,
          })
        }
      }
      return
    }

    if (commandName === 'forget') {
      const userId = interaction.user.id
      deleteUserData(userId)
      await interaction.reply({
        content: '🗑️ あなたのプロファイルと会話履歴をすべて削除しました。',
        ephemeral: true,
      })
      return
    }

    if (commandName === 'character') {
      const sub = interaction.options.getSubcommand()

      if (sub === 'list') {
        const chars = listCharacters()
        const list = chars.length > 0 ? chars.map((c) => `• ${c}`).join('\n') : '（なし）'
        await interaction.reply({
          content: `📋 利用可能なキャラクター:\n${list}`,
          ephemeral: true,
        })
      } else if (sub === 'current') {
        const character = this.config.characterManager.getCharacter(channelId)
        await interaction.reply({
          content: `🎭 現在のキャラクター: **${character.name}**`,
          ephemeral: true,
        })
      } else if (sub === 'set') {
        const name = interaction.options.getString('name', true)
        try {
          const character = this.config.characterManager.setCharacter(channelId, name)
          clearChannelHistory(channelId)
          await interaction.reply({
            content: `✅ キャラクターを **${character.name}** に変更しました。会話履歴もリセットしました。`,
            ephemeral: true,
          })
        } catch {
          await interaction.reply({
            content: `❌ キャラクター「${name}」が見つかりません。\`/character list\` で一覧を確認してください。`,
            ephemeral: true,
          })
        }
      }
      return
    }
  }

  async login(token: string): Promise<void> {
    await this.client.login(token)
  }
}
