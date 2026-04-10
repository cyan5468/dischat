# dischat

複数のLLMプロバイダー（Anthropic / OpenAI / Google Gemini）に対応したDiscordチャットボット。

## 機能

- **メンション返信**: ボットへのメンションに返答
- **DM対応**: ダイレクトメッセージに返答
- **自動返答チャンネル**: 指定チャンネルではメンション不要で返答
- **会話履歴**: チャンネルごとに最大20件の履歴を保持（再起動でリセット）
- **2000文字超え対応**: Discordの文字数制限を超える返答は自動分割送信

## スラッシュコマンド

| コマンド | 説明 |
|---|---|
| `/clear` | このチャンネルの会話履歴をクリア |
| `/autoreply add` | このチャンネルを自動返答対象に追加 |
| `/autoreply remove` | このチャンネルを自動返答対象から外す |
| `/autoreply list` | 自動返答対象のチャンネル一覧を表示 |

## 対応モデル

| プロバイダー | モデル |
|---|---|
| Anthropic | claude-haiku-4-5 |
| OpenAI | gpt-5.4-nano |
| Google Gemini | gemini-3.1-flash-lite-preview |

## セットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/cyan5468/dischat.git
cd dischat
```

### 2. 依存パッケージをインストール

```bash
pnpm install
```

### 3. 環境変数を設定

`.env` ファイルをプロジェクトルートに作成する。

```env
DISCORD_TOKEN=your_discord_bot_token

# 使用するプロバイダーを指定（anthropic / openai / gemini）
DEFAULT_PROVIDER=anthropic

ANTHROPIC_API_KEY=your_anthropic_api_key
OPENAI_API_KEY=your_openai_api_key
GEMINI_API_KEY=your_gemini_api_key

```

### 4. ビルド & 起動

```bash
pnpm build
pnpm start
```

## Discord Developer Portal の設定

[Discord Developer Portal](https://discord.com/developers/applications) で以下を有効にする。

- **Bot** → `MESSAGE CONTENT INTENT` をオン
- **Bot** → `SERVER MEMBERS INTENT` をオン
- **OAuth2 → URL Generator** でスコープ `bot` + `applications.commands` を選択し、ボットをサーバーに招待

## Railwayへのデプロイ

1. [Railway](https://railway.app/) でGitHubリポジトリを連携して新規プロジェクトを作成
2. 環境変数（`DISCORD_TOKEN`, `LLM_PROVIDER`, 各APIキー）をRailwayのVariablesに設定
3. pushするたびに自動デプロイされる

## キャラクター設定

`characters/default.json` でシステムプロンプトを変更できる。

```json
{
  "name": "アシスタント",
  "systemPrompt": "あなたは親切なアシスタントです。Discordで会話しています。自然で読みやすい返答を心がけてください。"
}
```

## ライセンス

MIT
