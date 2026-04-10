import type { Skill, SkillsConfig, CustomSkillData } from './types'
import { imageAnalysisSkill } from './builtins/imageAnalysis'
import { dataAnalysisSkill } from './builtins/dataAnalysis'
import { documentSummarySkill } from './builtins/documentSummary'
import { translationSkill } from './builtins/translation'
import { writingAssistantSkill } from './builtins/writingAssistant'

class SkillManager {
  private builtinSkills: Skill[] = []
  private config: SkillsConfig = { disabledSkillIds: [], customSkills: [] }
  private loaded = false

  constructor() {
    const builtins = [
      imageAnalysisSkill,
      dataAnalysisSkill,
      documentSummarySkill,
      translationSkill,
      writingAssistantSkill,
    ]
    this.builtinSkills = builtins.map((s) => ({ ...s, isBuiltin: true, enabled: true }))
  }

  async loadConfig() {
    try {
      const cfg = await window.electronAPI.skills.getConfig()
      this.config = cfg
    } catch {
      this.config = { disabledSkillIds: [], customSkills: [] }
    }
    this.loaded = true
  }

  async saveConfig() {
    await window.electronAPI.skills.setConfig(this.config)
  }

  private buildCustomSkill(data: CustomSkillData): Skill {
    return {
      id: data.id,
      name: data.name,
      icon: data.icon,
      description: data.description,
      category: data.category,
      isBuiltin: false,
      enabled: true,
      systemPrompt: data.systemPrompt,
      userPromptTemplate: data.userPromptTemplate,
      execute(input: string) {
        const userPrompt = data.userPromptTemplate
          ? data.userPromptTemplate.replace(/\{input\}/g, input || '')
          : input
        return {
          systemPrompt: data.systemPrompt,
          userPrompt,
        }
      },
    }
  }

  getAll(): Skill[] {
    const builtins = this.builtinSkills.map((s) => ({
      ...s,
      enabled: !this.config.disabledSkillIds.includes(s.id),
    }))
    const customs = this.config.customSkills.map((d) => this.buildCustomSkill(d))
    return [...builtins, ...customs]
  }

  getEnabled(): Skill[] {
    return this.getAll().filter((s) => s.enabled !== false)
  }

  get(id: string): Skill | undefined {
    return this.getAll().find((s) => s.id === id)
  }

  getByCategory(category: Skill['category']): Skill[] {
    return this.getAll().filter((s) => s.category === category)
  }

  async toggleSkill(id: string) {
    const idx = this.config.disabledSkillIds.indexOf(id)
    if (idx >= 0) {
      this.config.disabledSkillIds.splice(idx, 1)
    } else {
      this.config.disabledSkillIds.push(id)
    }
    await this.saveConfig()
  }

  async addCustomSkill(data: Omit<CustomSkillData, 'id'>): Promise<CustomSkillData> {
    const id = 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const skill: CustomSkillData = { ...data, id }
    this.config.customSkills.push(skill)
    await this.saveConfig()
    return skill
  }

  async updateCustomSkill(id: string, data: Partial<Omit<CustomSkillData, 'id'>>) {
    const idx = this.config.customSkills.findIndex((s) => s.id === id)
    if (idx >= 0) {
      this.config.customSkills[idx] = { ...this.config.customSkills[idx], ...data }
      await this.saveConfig()
    }
  }

  async deleteCustomSkill(id: string) {
    this.config.customSkills = this.config.customSkills.filter((s) => s.id !== id)
    // Also remove from disabled list if present
    this.config.disabledSkillIds = this.config.disabledSkillIds.filter((d) => d !== id)
    await this.saveConfig()
  }

  isLoaded() {
    return this.loaded
  }
}

export const skillManager = new SkillManager()
