import { readFileSync, readdirSync } from 'fs'
import path from 'path'

export interface Character {
  name: string
  systemPrompt: string
}

const CHARACTERS_DIR = path.resolve('./characters')

export function loadCharacter(name: string): Character {
  const filePath = path.join(CHARACTERS_DIR, `${name}.json`)
  const raw = readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as Character
}

export function listCharacters(): string[] {
  try {
    return readdirSync(CHARACTERS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
  } catch {
    return []
  }
}

export class CharacterManager {
  // channelId → character name（インメモリ、再起動でリセット）
  private channelMap: Map<string, string> = new Map()
  private defaultCharacter: Character

  constructor(defaultCharacter: Character) {
    this.defaultCharacter = defaultCharacter
  }

  getCharacter(channelId: string): Character {
    const name = this.channelMap.get(channelId)
    if (!name) return this.defaultCharacter
    try {
      return loadCharacter(name)
    } catch {
      // ファイルが見つからなければデフォルトに戻す
      this.channelMap.delete(channelId)
      return this.defaultCharacter
    }
  }

  setCharacter(channelId: string, name: string): Character {
    const character = loadCharacter(name) // 存在しなければ例外が出る
    this.channelMap.set(channelId, name)
    return character
  }

  resetCharacter(channelId: string): void {
    this.channelMap.delete(channelId)
  }
}
