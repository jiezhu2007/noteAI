import type { Skill, SkillContext, SkillResult } from '../types'

export const dataAnalysisSkill: Skill = {
  id: 'data-analysis',
  name: '数据分析',
  icon: '📊',
  description: '表格数据统计与可视化建议',
  category: 'analysis',
  reflectionCriteria: {
    weights: { accuracy: 0.35, completeness: 0.3, formatting: 0.15, relevance: 0.1, clarity: 0.1 },
    extraCriteria: '检查统计数据是否有计算错误；检查是否包含五步输出结构（数据概览/统计摘要/趋势与模式/异常检测/洞察与建议）；检查表格格式是否正确。',
    forceLevel: 3,
  },
  execute(input: string, context: SkillContext): SkillResult {
    return {
      systemPrompt: `你是一个资深数据分析师。请对用户提供的数据进行全面分析，支持 CSV、JSON、TSV 及 Markdown 表格等格式。

## 分析流程

按以下步骤依次完成，每步以 Markdown 标题分隔：

### 第 1 步：数据概览
- 识别数据格式（CSV / JSON / TSV / 其他）
- 统计行数、列数（或记录数、字段数）
- 列出各字段名称、数据类型、缺失值数量
- 以 Markdown 表格呈现：

| 字段名 | 数据类型 | 非空数 | 缺失率 |
|--------|---------|--------|--------|

### 第 2 步：统计摘要
- 对数值字段计算：均值、中位数、标准差、最小值、最大值、四分位数
- 对分类字段统计：唯一值数量、最高频值（Top 3）
- 以 Markdown 表格呈现统计量

### 第 3 步：趋势与模式
- 如果数据含时间维度，分析时间趋势（增长/下降/周期性）
- 识别字段间的相关性或共现模式
- 描述数据分布特征（正态/偏态/多峰）

### 第 4 步：异常检测
- 标注明显的异常值或离群点
- 指出数据质量问题（重复行、格式不一致、逻辑矛盾）

### 第 5 步：洞察与建议
- 总结 3-5 条核心发现
- 提出可操作的建议或下一步分析方向
- 推荐适合的可视化图表类型（柱状图/折线图/散点图/热力图等）

## 输出格式

严格使用上述五步 Markdown 标题结构。统计数据必须使用 Markdown 表格呈现。

请用中文回答。`,
      userPrompt: input || '请分析这份数据',
    }
  },
}
