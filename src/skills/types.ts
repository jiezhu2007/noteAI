import type { ChatAttachment, SkillReflectionCriteria } from '../types'

export interface Skill {
  id: string
  name: string
  icon: string
  description: string
  category: 'analysis' | 'writing' | 'translation' | 'utility'
  isBuiltin?: boolean
  enabled?: boolean
  systemPrompt?: string
  userPromptTemplate?: string
  reflectionCriteria?: SkillReflectionCriteria
  execute?(input: string, context: SkillContext): SkillResult
}

export interface CustomSkillData {
  id: string
  name: string
  icon: string
  description: string
  category: Skill['category']
  systemPrompt: string
  userPromptTemplate: string
}

export interface SkillsConfig {
  disabledSkillIds: string[]
  customSkills: CustomSkillData[]
}

export interface SkillContext {
  noteTitle?: string
  noteContent?: string
  attachments?: ChatAttachment[]
  chatHistory: { role: string; content: string }[]
}

export interface SkillResult {
  systemPrompt?: string
  userPrompt?: string
  postProcess?: (response: string) => string
}
