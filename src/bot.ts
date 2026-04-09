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
import { LLMProvider, Message } from './llm/base'

const MAX_HISTORY = 20
const DISCORD_MAX_LENGTH = 2000

export interface BotConfig {
  provider: LLMProvider
  systemPrompt: string
  autoReplyChannels: Set<string>
}

export class DiscordBot {
  private client: Client
  // channelId → 会話履歴
  private history: Map<string, Message[]> = new Map()
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
    ]

    const rest = new REST().setToken(process.env.DISCORD_TOKEN!)
    try {
      await rest.put(Routes.applicationCommands(clientId), { body: commands })
      console.log('✅ Slash commands registered globally')
    } catch (err) {
      console.error('❌ Failed to register slash commands:', err)
    }
  }

  // 履歴を取得（なければ作成）
  private getHistory(channelId: string): Message[] {
    if (!this.history.has(channelId)) {
      this.history.set(channelId, [])
    }
    return this.history.get(channelId)!
  }

  // 履歴に追加し、MAX_HISTORY を超えたら古いものを削除
  private addToHistory(channelId: string, role: 'user' | 'assistant', content: string): void {
    const hist = this.getHistory(channelId)
    hist.push({ role, content })
    if (hist.length > MAX_HISTORY) {
      hist.splice(0, hist.length - MAX_HISTORY)
    }
  }

  private async handleMessage(msg: DiscordMessage): Promise<void> {
    if (msg.author.bot) return

    const isDM = msg.channel.type === ChannelType.DM
    const isAutoReply = this.config.autoReplyChannels.has(msg.channelId)
    const isMentioned = this.client.user
      ? msg.mentions.users.has(this.client.user.id)
      : false

    // 反応すべきメッセージか判定
    if (!isDM && !isAutoReply && !isMentioned) return

    // メンション部分を除去してテキストを取得
    let content = msg.content
    if (isMentioned) {
      content = content.replace(/<@!?\d+>/g, '').trim()
    }
    if (!content) return

    const channelId = msg.channelId

    // send/sendTyping をサポートしないチャンネル（PartialGroupDMChannel など）は除外
    if (!('sendTyping' in msg.channel)) return
    const channel = msg.channel as { sendTyping(): Promise<void>; send(content: string): Promise<unknown> }

    // タイピングインジケーターを表示
    await channel.sendTyping()

    this.addToHistory(channelId, 'user', content)

    try {
      const response = await this.config.provider.chat(
        this.getHistory(channelId),
        this.config.systemPrompt,
      )

      this.addToHistory(channelId, 'assistant', response)

      // Discord の 2000 文字制限に対応してチャンク送信
      if (response.length <= DISCORD_MAX_LENGTH) {
        await msg.reply(response)
      } else {
        const chunks = response.match(new RegExp(`.{1,${DISCORD_MAX_LENGTH}}`, 'gs')) ?? [response]
        for (const chunk of chunks) {
          await channel.send(chunk)
        }
      }
    } catch (err) {
      console.error('❌ LLM error:', err)
      // エラー時はユーザーのメッセージを履歴から削除
      const hist = this.getHistory(channelId)
      hist.pop()
      await msg.reply('エラーが発生しました。しばらくしてからもう一度お試しください。')
    }
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.commandName === 'clear') {
      this.history.delete(interaction.channelId)
      await interaction.reply({
        content: '🗑️ 会話履歴をクリアしました！',
        ephemeral: true,
      })
    }

    if (interaction.commandName === 'autoreply') {
      const sub = interaction.options.getSubcommand()
      const channelId = interaction.channelId

      if (sub === 'add') {
        if (this.config.autoReplyChannels.has(channelId)) {
          await interaction.reply({ content: 'このチャンネルはすでに自動返答対象です。', ephemeral: true })
        } else {
          this.config.autoReplyChannels.add(channelId)
          await interaction.reply({ content: `✅ <#${channelId}> を自動返答対象に追加しました。`, ephemeral: true })
        }
      }

      if (sub === 'remove') {
        if (!this.config.autoReplyChannels.has(channelId)) {
          await interaction.reply({ content: 'このチャンネルは自動返答対象ではありません。', ephemeral: true })
        } else {
          this.config.autoReplyChannels.delete(channelId)
          await interaction.reply({ content: `🗑️ <#${channelId}> を自動返答対象から外しました。`, ephemeral: true })
        }
      }

      if (sub === 'list') {
        if (this.config.autoReplyChannels.size === 0) {
          await interaction.reply({ content: '自動返答対象のチャンネルはありません。', ephemeral: true })
        } else {
          const list = [...this.config.autoReplyChannels].map((id) => `<#${id}>`).join('\n')
          await interaction.reply({ content: `📋 自動返答対象チャンネル:\n${list}`, ephemeral: true })
        }
      }
    }
  }

  async login(token: string): Promise<void> {
    await this.client.login(token)
  }
}
