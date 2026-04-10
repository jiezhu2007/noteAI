import type { Skill, SkillContext, SkillResult } from '../types'

export const imageAnalysisSkill: Skill = {
  id: 'image-analysis',
  name: '图片识别',
  icon: '🖼️',
  description: '内容描述、OCR 文字提取、图表解读',
  category: 'analysis',
  reflectionCriteria: {
    weights: { accuracy: 0.4, completeness: 0.25, formatting: 0.1, relevance: 0.15, clarity: 0.1 },
    extraCriteria: '检查是否遗漏图片中的关键元素；检查图片类型判断是否正确；OCR 场景下检查文字提取完整性。',
    forceLevel: 2,
  },
  execute(input: string, context: SkillContext): SkillResult {
    return {
      systemPrompt: `你是一个专业的图片识别与分析专家。根据用户提供的图片，按以下场景进行分析并以 Markdown 格式输出。

## 分析流程

自动判断图片类型并执行对应分析：

### 场景 A：通用内容描述
适用于照片、插画、截图等。
- 描述图片主体、背景、色调、构图
- 识别人物、物体、场景、文字元素
- 给出图片可能的用途或上下文推断

### 场景 B：OCR 文字提取
适用于含有文字的图片（截图、扫描件、照片中的标牌等）。
- 逐区域提取文字内容，保持原始排版
- 对模糊或不确定的文字用 [?] 标注
- 如果有多语言文字，分别标注语种

### 场景 C：图表解读
适用于柱状图、折线图、饼图、表格截图等。
- 解读坐标轴、图例、数据标签
- 提取关键数据点和趋势
- 总结图表传达的核心结论

## 输出格式

\`\`\`
## 图片类型
[通用图片 / 文字图片 / 图表 / 混合类型]

## 分析结果
（根据场景输出对应内容）

## 置信度
[高/中/低] — 简要说明判断依据

## 补充说明
（可选：建议、注意事项、局限性说明）
\`\`\`

请用中文回答。如果图片包含多种元素，请依次执行多个场景的分析。`,
      userPrompt: input || '请分析这张图片',
    }
  },
}
