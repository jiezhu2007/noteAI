import { create } from 'zustand'
import type { Skill, CustomSkillData } from '../skills/types'
import { skillManager } from '../skills/skillManager'

interface SkillState {
  activeSkill: Skill | null
  skills: Skill[]
  loaded: boolean
  activateSkill: (skill: Skill | null) => void
  loadSkills: () => Promise<void>
  toggleSkillEnabled: (id: string) => Promise<void>
  addCustomSkill: (data: Omit<CustomSkillData, 'id'>) => Promise<void>
  updateCustomSkill: (id: string, data: Partial<Omit<CustomSkillData, 'id'>>) => Promise<void>
  deleteCustomSkill: (id: string) => Promise<void>
}

export const useSkillStore = create<SkillState>((set, get) => ({
  activeSkill: null,
  skills: [],
  loaded: false,

  activateSkill: (skill) => {
    const current = get().activeSkill
    if (current && skill && current.id === skill.id) {
      set({ activeSkill: null })
    } else {
      set({ activeSkill: skill })
    }
  },

  loadSkills: async () => {
    await skillManager.loadConfig()
    set({ skills: skillManager.getAll(), loaded: true })
  },

  toggleSkillEnabled: async (id) => {
    await skillManager.toggleSkill(id)
    const skills = skillManager.getAll()
    const { activeSkill } = get()
    // If the toggled skill was active and is now disabled, deactivate it
    const updated = skills.find((s) => s.id === id)
    const newActive = activeSkill && activeSkill.id === id && updated?.enabled === false
      ? null
      : activeSkill
    set({ skills, activeSkill: newActive })
  },

  addCustomSkill: async (data) => {
    await skillManager.addCustomSkill(data)
    set({ skills: skillManager.getAll() })
  },

  updateCustomSkill: async (id, data) => {
    await skillManager.updateCustomSkill(id, data)
    set({ skills: skillManager.getAll() })
  },

  deleteCustomSkill: async (id) => {
    const { activeSkill } = get()
    await skillManager.deleteCustomSkill(id)
    const newActive = activeSkill && activeSkill.id === id ? null : activeSkill
    set({ skills: skillManager.getAll(), activeSkill: newActive })
  },
}))
