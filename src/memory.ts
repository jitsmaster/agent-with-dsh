/**
 * memory.ts — conversation memory for the standalone Agent.
 *
 * LangChain-style memory. The default is in-memory (per Agent instance);
 * `JsonlFileMemory` persists every message to a JSONL file so a conversation
 * survives process restarts. Wire one in with `createAgent({ memory })`.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Message } from '@earendil-works/pi-ai'

/** A conversation store. */
export interface ConversationMemory {
  /** All messages stored so far, in order. */
  load(): Message[]
  /** Append one message durably (for file-backed memories). */
  append(message: Message): void
  /** Drop the conversation. */
  clear(): void
}

/** Plain in-process memory (the Agent default). */
export class InMemoryMemory implements ConversationMemory {
  private messages: Message[] = []

  load(): Message[] {
    return [...this.messages]
  }

  append(message: Message): void {
    this.messages.push(message)
  }

  clear(): void {
    this.messages = []
  }
}

/**
 * Append-only JSONL-backed memory: one message per line, durable across
 * restarts. Load tolerates a missing file and skips corrupt lines.
 */
export class JsonlFileMemory implements ConversationMemory {
  private messages: Message[] = []

  constructor(private readonly path: string) {
    this.messages = this.readExisting()
  }

  private readExisting(): Message[] {
    if (!existsSync(this.path)) return []
    const out: Message[] = []
    let raw: string
    try {
      raw = readFileSync(this.path, 'utf8')
    } catch {
      return []
    }
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        out.push(JSON.parse(trimmed) as Message)
      } catch {
        // skip corrupt lines
      }
    }
    return out
  }

  load(): Message[] {
    return [...this.messages]
  }

  append(message: Message): void {
    this.messages.push(message)
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      appendFileSync(this.path, JSON.stringify(message) + '\n', 'utf8')
    } catch (err) {
      // Persistence failure must not kill the conversation; warn and continue.
      console.warn(`[memory] failed to persist to ${this.path}: ${(err as Error).message}`)
    }
  }

  clear(): void {
    this.messages = []
    try {
      writeFileSync(this.path, '', 'utf8')
    } catch (err) {
      console.warn(`[memory] failed to clear ${this.path}: ${(err as Error).message}`)
    }
  }
}
