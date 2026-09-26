import type { KnowledgeScenario } from '@shared/types/KnowledgeGenerationTypes';

export type ScenarioDefinition = {
  name: string;
  description: string;
  sections: { key: string; title: string; instruction: string }[];
};
export type KnowledgeOutputLanguage = 'zh' | 'en';
export const SCENARIOS: Record<KnowledgeScenario, ScenarioDefinition> = {
  meeting: {
    name: 'Meeting',
    description:
      'Decisions, alignment, risks, and unresolved questions from a meeting.',
    sections: [
      {
        key: 'discussionTopics',
        title: 'Discussion Topics',
        instruction:
          'Substantive topics discussed. For each, capture concrete positions, reasoning, evidence, constraints, and context—not merely the topic name.',
      },
      {
        key: 'decisions',
        title: 'Decisions',
        instruction:
          'Explicit decisions or choices, including stated rationale, scope, conditions, and rejected alternatives. Do not turn proposals into decisions.',
      },
      {
        key: 'agreements',
        title: 'Agreements & Alignment',
        instruction:
          'Points participants explicitly agreed on, including who agreed and any qualifications when stated.',
      },
      {
        key: 'disagreements',
        title: 'Disagreements & Trade-offs',
        instruction:
          "Differing positions, objections, debated trade-offs, and each side's reasons. Preserve attribution when stated.",
      },
      {
        key: 'risks',
        title: 'Risks & Issues',
        instruction:
          'Problems, blockers, dependencies, constraints, and risks, together with causes, impact, or mitigation discussed.',
      },
      {
        key: 'openQuestions',
        title: 'Unresolved Questions',
        instruction:
          'Questions or issues left unresolved, including options, missing information, and why resolution was not reached.',
      },
    ],
  },
  lecture: {
    name: 'Lecture',
    description:
      'Concepts, explanations, examples, and caveats from teaching material.',
    sections: [
      {
        key: 'concepts',
        title: 'Concepts & Definitions',
        instruction:
          'Concepts and terms actually taught. Define each from the note and include distinguishing features, conditions, or boundaries stated.',
      },
      {
        key: 'explanations',
        title: 'Explanations & Reasoning',
        instruction:
          'How or why something works: mechanisms, processes, derivations, causal reasoning, and step-by-step explanations in the note.',
      },
      {
        key: 'examples',
        title: 'Examples & Applications',
        instruction:
          'Concrete examples, demonstrations, cases, or applications, with what each illustrates and its relevant details.',
      },
      {
        key: 'relationships',
        title: 'Relationships',
        instruction:
          'Explicit comparisons, contrasts, dependencies, hierarchies, sequences, cause/effect links, or relationships among concepts.',
      },
      {
        key: 'misunderstandings',
        title: 'Misunderstandings & Caveats',
        instruction:
          'Misconceptions corrected, confusions, exceptions, limitations, caveats, or edge cases explicitly discussed.',
      },
      {
        key: 'openQuestions',
        title: 'Unclear or Open Questions',
        instruction:
          'Questions left open and points explicitly needing clarification. Do not invent study questions.',
      },
    ],
  },
  consultation: {
    name: 'Consultation',
    description: 'Concerns, assessment, advice, options, and constraints.',
    sections: [
      {
        key: 'situation',
        title: 'Situation & Concerns',
        instruction:
          "The user's concrete circumstances, symptoms or problems, history, goals, and concerns relevant to the consultation.",
      },
      {
        key: 'assessment',
        title: 'Assessment',
        instruction:
          "The professional's stated interpretation or assessment, including supporting observations and uncertainty. Do not add a diagnosis or conclusion.",
      },
      {
        key: 'advice',
        title: 'Advice & Rationale',
        instruction:
          'Recommendations actually given and their stated reasons, expected benefits, conditions, or instructions.',
      },
      {
        key: 'options',
        title: 'Options & Trade-offs',
        instruction:
          'Alternative approaches discussed, including benefits, drawbacks, suitability, costs, or selection criteria stated for each.',
      },
      {
        key: 'constraints',
        title: 'Constraints & Warnings',
        instruction:
          'Limitations, contraindications, risks, dependencies, warnings, or boundaries, with context and consequences.',
      },
      {
        key: 'uncertainties',
        title: 'Unknowns to Clarify',
        instruction:
          'Facts, tests, inputs, or outcomes explicitly unknown or needing confirmation, including why they matter.',
      },
    ],
  },
  interview: {
    name: 'Interview',
    description:
      'Perspectives, behavior, needs, motivations, patterns, and quotes.',
    sections: [
      {
        key: 'perspectives',
        title: 'Perspectives & Beliefs',
        instruction:
          "The interviewee's specific viewpoints, beliefs, preferences, and reasoning, with the context in which they apply.",
      },
      {
        key: 'behaviors',
        title: 'Behaviors & Context',
        instruction:
          'What the interviewee actually does or experiences: workflows, habits, environment, triggers, frequency, and circumstances.',
      },
      {
        key: 'needs',
        title: 'Needs & Pain Points',
        instruction:
          'Goals, needs, frustrations, obstacles, and workarounds, including causes, impact, severity, or frequency when stated.',
      },
      {
        key: 'motivations',
        title: 'Motivations & Decision Factors',
        instruction:
          'What drives choices or behavior, including priorities, success criteria, concerns, and trade-offs.',
      },
      {
        key: 'insights',
        title: 'Supported Patterns',
        instruction:
          "Patterns supported by multiple statements. Prefix cautious synthesis with 'Inference:' (or the note's equivalent); do not add outside assumptions.",
      },
      {
        key: 'quotes',
        title: 'Notable Quotes',
        instruction:
          'Short verbatim statements worth preserving, with speaker or context when available. Never fabricate or polish a quote.',
      },
    ],
  },
  brainstorm: {
    name: 'Brainstorm',
    description: 'Ideas, alternatives, connections, criteria, and directions.',
    sections: [
      {
        key: 'ideas',
        title: 'Ideas',
        instruction:
          'Every distinct meaningful idea, including its purpose, mechanism, intended user or context, and elaborating details when stated.',
      },
      {
        key: 'alternatives',
        title: 'Alternatives & Variations',
        instruction:
          'Alternative implementations, variants, combinations, or competing approaches explicitly suggested, with how they differ.',
      },
      {
        key: 'connections',
        title: 'Connections & Themes',
        instruction:
          'Supported relationships among ideas: shared themes, combinations, dependencies, analogies, or one idea enabling another.',
      },
      {
        key: 'evaluation',
        title: 'Pros, Cons & Criteria',
        instruction:
          'Benefits, drawbacks, feasibility, constraints, risks, and evaluation criteria. Attribute each evaluation to its idea.',
      },
      {
        key: 'promisingDirections',
        title: 'Promising Directions',
        instruction:
          'Ideas explicitly favored, prioritized, or called promising, including the stated evidence or reason. Do not rank them yourself.',
      },
      {
        key: 'openQuestions',
        title: 'Open Questions',
        instruction:
          'Unanswered questions, assumptions to test, missing information, and tensions raised. Do not invent follow-up tasks.',
      },
    ],
  },
  general: {
    name: 'General',
    description:
      'Context, supporting detail, reasoning, nuance, and open questions.',
    sections: [
      {
        key: 'background',
        title: 'Background & Context',
        instruction:
          'Specific background, circumstances, actors, goals, and constraints needed beyond a generic summary.',
      },
      {
        key: 'details',
        title: 'Supporting Details',
        instruction:
          'Concrete facts, evidence, observations, figures, examples, quotations, or references that add substance.',
      },
      {
        key: 'relationships',
        title: 'Relationships & Reasoning',
        instruction:
          'Explicit causes, effects, comparisons, dependencies, sequences, arguments, and how information relates.',
      },
      {
        key: 'perspectives',
        title: 'Perspectives & Nuance',
        instruction:
          'Distinct viewpoints, interpretations, qualifications, uncertainty, disagreements, exceptions, and caveats.',
      },
      {
        key: 'openQuestions',
        title: 'Open Questions & Unknowns',
        instruction:
          'Questions explicitly raised or information explicitly missing or uncertain. Do not invent useful-sounding questions.',
      },
    ],
  },
};

const ZH_SCENARIO_COPY: Record<
  KnowledgeScenario,
  { name: string; description: string; sectionTitles: Record<string, string> }
> = {
  meeting: {
    name: '会议',
    description: '提取会议中的决策、共识、风险与未决问题。',
    sectionTitles: {
      discussionTopics: '讨论议题',
      decisions: '决策',
      agreements: '共识与一致意见',
      disagreements: '分歧与权衡',
      risks: '风险与问题',
      openQuestions: '未决问题',
    },
  },
  lecture: {
    name: '讲座',
    description: '提取教学内容中的概念、解释、示例与注意事项。',
    sectionTitles: {
      concepts: '概念与定义',
      explanations: '解释与推理',
      examples: '示例与应用',
      relationships: '关系',
      misunderstandings: '误解与注意事项',
      openQuestions: '模糊或开放问题',
    },
  },
  consultation: {
    name: '咨询',
    description: '提取关切、评估、建议、可选方案与限制条件。',
    sectionTitles: {
      situation: '情况与关切',
      assessment: '评估',
      advice: '建议与依据',
      options: '选项与权衡',
      constraints: '限制与警示',
      uncertainties: '待澄清事项',
    },
  },
  interview: {
    name: '访谈',
    description: '提取观点、行为、需求、动机、模式与代表性原话。',
    sectionTitles: {
      perspectives: '观点与看法',
      behaviors: '行为与情境',
      needs: '需求与痛点',
      motivations: '动机与决策因素',
      insights: '有依据的模式',
      quotes: '代表性原话',
    },
  },
  brainstorm: {
    name: '头脑风暴',
    description: '提取想法、替代方案、关联、判断标准与推进方向。',
    sectionTitles: {
      ideas: '想法',
      alternatives: '替代方案与变体',
      connections: '关联与主题',
      evaluation: '优缺点与判断标准',
      promisingDirections: '值得推进的方向',
      openQuestions: '开放问题',
    },
  },
  general: {
    name: '通用',
    description: '提取上下文、支撑细节、推理、细微差异与开放问题。',
    sectionTitles: {
      background: '背景与上下文',
      details: '支撑细节',
      relationships: '关系与推理',
      perspectives: '观点与细微差异',
      openQuestions: '开放问题与未知信息',
    },
  },
};

/** 内置模板的稳定 key 与提取规则保持不变，仅按应用语言替换可见文案。 */
export function getScenarioDefinition(
  scenario: KnowledgeScenario,
  language: KnowledgeOutputLanguage = 'en',
): ScenarioDefinition {
  const definition = SCENARIOS[scenario];
  if (language !== 'zh') return definition;
  const copy = ZH_SCENARIO_COPY[scenario];
  return {
    name: copy.name,
    description: copy.description,
    sections: definition.sections.map((section) => ({
      ...section,
      title: copy.sectionTitles[section.key] ?? section.title,
    })),
  };
}
