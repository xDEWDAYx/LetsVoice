export const GENERIC_WORKSPACE_NAME =
  /^(workspace|new workspace|untitled|工作空间|新工作空间|未命名|临时)(\s*\d+)?$/i;

export const WORKSPACE_CATEGORIES = [
  {
    category: '会议',
    name: '会议与行动项',
    keywords: [
      'meeting',
      'standup',
      'minutes',
      'action item',
      '会议',
      '周会',
      '讨论',
    ],
  },
  {
    category: '学习',
    name: '学习资料与复习',
    keywords: [
      'lecture',
      'course',
      'assignment',
      'exam',
      'study',
      '课程',
      '作业',
      '考试',
      '复习',
    ],
  },
  {
    category: '研究',
    name: '研究资料与发现',
    keywords: [
      'research',
      'paper',
      'experiment',
      'dataset',
      '调研',
      '论文',
      '实验',
      '数据集',
    ],
  },
  {
    category: '项目',
    name: '项目推进与记录',
    keywords: [
      'project',
      'sprint',
      'requirement',
      'release',
      '项目',
      '需求',
      '开发',
      '发布',
    ],
  },
  {
    category: '灵感',
    name: '灵感与待办',
    keywords: [
      'idea',
      'brainstorm',
      'journal',
      'todo',
      '灵感',
      '创意',
      '日记',
      '待办',
    ],
  },
] as const;
