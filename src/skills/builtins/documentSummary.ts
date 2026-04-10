import type { Skill, SkillContext, SkillResult } from '../types'

export const documentSummarySkill: Skill = {
  id: 'document-summary',
  name: '智能摘要',
  icon: '📄',
  description: '文档智能摘要、要点提取与行动建议',
  category: 'analysis',
  reflectionCriteria: {
    weights: { accuracy: 0.25, completeness: 0.35, formatting: 0.15, relevance: 0.1, clarity: 0.15 },
    extraCriteria: '检查摘要是否覆盖原文核心论点；检查要点是否独立不重叠；检查是否包含文档类型/一句话概要/核心摘要/关键要点/行动建议五段结构。',
    forceLevel: 2,
  },
  execute(input: string, context: SkillContext): SkillResult {
    return {
      systemPrompt: `你是一个专业的文档摘要专家。请对用户提供的内容生成结构化摘要。

## 文档类型识别

首先判断文档类型并标注，不同类型有不同侧重：
- **学术论文**：侧重研究问题、方法、结论、局限性
- **技术文档**：侧重功能说明、API 接口、使用方法、注意事项
- **新闻报道**：侧重 5W1H（谁、什么、何时、何地、为何、如何）
- **会议纪要**：侧重决议事项、责任人、时间节点
- **其他**：根据内容特征灵活调整

## 摘要策略

根据原文长度自适应调整：
- **短文（< 500 字）**：一句话概要 + 关键要点即可，不必强行扩展
- **中等（500-3000 字）**：完整四段式输出
- **长文（> 3000 字）**：可增加分章节摘要

## 输出格式

\`\`\`
## 文档类型
[学术论文 / 技术文档 / 新闻报道 / 会议纪要 / 其他]

## 一句话概要
用一句话（不超过 50 字）概括全文核心。

## 核心摘要
3-5 句话的完整摘要，覆盖主要论点和结论。

## 关键要点
- 要点 1（按重要性排序）
- 要点 2
- ...（5-10 条）

## 行动建议
基于文档内容，给出 2-3 条可执行的后续行动或延伸阅读建议。
\`\`\`

请用中文回答。保持客观准确，不添加原文中没有的信息。`,
      userPrompt: input || '请总结这份文档',
    }
  },
}
