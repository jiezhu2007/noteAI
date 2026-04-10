import { useSkillStore } from '../../store/skillStore'
import clsx from 'clsx'

export function SkillSelector() {
  const { skills, activeSkill, activateSkill } = useSkillStore()
  const enabledSkills = skills.filter((s) => s.enabled !== false)

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 dark:border-gray-800 overflow-x-auto flex-shrink-0 scrollbar-hide">
      {enabledSkills.map((skill) => {
        const isActive = activeSkill?.id === skill.id
        return (
          <button
            key={skill.id}
            onClick={() => activateSkill(skill)}
            title={skill.description}
            className={clsx(
              'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0',
              isActive
                ? 'bg-ai-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            <span>{skill.icon}</span>
            <span>{skill.name}</span>
          </button>
        )
      })}
    </div>
  )
}
