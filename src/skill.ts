/**
 * skill.ts — framework-native skills (DSH-style, no harness needed).
 *
 * A skill is a named bundle of markdown instructions the model can load on
 * demand. The Agent lists the skill catalog in its system prompt and exposes
 * a `use_skill` tool; when the model calls it, the skill's instructions are
 * returned as the tool result (mirroring DSH's `skill` tool + catalog).
 */
import { Type } from '@earendil-works/pi-ai'
import { defineTool, type ToolSpec } from './tools.ts'

/** A reusable instruction bundle. */
export interface Skill {
  /** Unique skill name. */
  name: string
  /** When to use it — shown in the catalog. */
  description: string
  /** Markdown instructions loaded on demand. */
  instructions: string
}

/** Registry of skills with catalog rendering. */
export class SkillRegistry {
  private skills = new Map<string, Skill>()

  constructor(skills: Skill[] = []) {
    for (const skill of skills) this.register(skill)
  }

  register(skill: Skill): this {
    if (this.skills.has(skill.name)) {
      throw new Error(`skill "${skill.name}" is already registered`)
    }
    this.skills.set(skill.name, skill)
    return this
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name)
  }

  list(): Skill[] {
    return [...this.skills.values()]
  }

  /** "- name: description" lines for the system-prompt catalog. */
  toCatalogText(): string {
    return this.list()
      .map((s) => `- ${s.name}: ${s.description}`)
      .join('\n')
  }

  /** Build the model-facing `use_skill` tool for this registry. */
  toUseSkillTool(): ToolSpec {
    return defineTool({
      name: 'use_skill',
      description:
        'Load the instructions for a skill and follow them. Available skills:\n' +
        this.toCatalogText(),
      parameters: Type.Object({
        name: Type.String({ description: 'The skill name to load.' }),
      }),
      run: ({ name }) => {
        const skill = this.get(name)
        if (!skill) {
          throw new Error(`unknown skill "${name}" (available: ${this.list().map((s) => s.name).join(', ')})`)
        }
        return skill.instructions
      },
    })
  }
}

/** Convenience factory. */
export function defineSkill(skill: Skill): Skill {
  return skill
}
