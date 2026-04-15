import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { getChannelCharacter, setChannelCharacter, clearChannelCharacter } from './db'

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
  private defaultCharacter: Character

  constructor(defaultCharacter: Character) {
    this.defaultCharacter = defaultCharacter
  }

  getCharacter(channelId: string): Character {
    const name = getChannelCharacter(channelId)
    if (!name) return this.defaultCharacter
    try {
      return loadCharacter(name)
    } catch {
      // ファイルが見つからなければデフォルトに戻す
      clearChannelCharacter(channelId)
      return this.defaultCharacter
    }
  }

  setCharacter(channelId: string, name: string): Character {
    const character = loadCharacter(name) // 存在しなければ例外が出る
    setChannelCharacter(channelId, name)
    return character
  }

  resetCharacter(channelId: string): void {
    clearChannelCharacter(channelId)
  }
}
