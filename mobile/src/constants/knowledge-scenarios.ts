import type { KnowledgeScenario } from "@/domain/knowledge/knowledge-document";

export type KnowledgeScenarioDefinition = { id: KnowledgeScenario; name: string; description: string; sections: readonly { key: string; title: string; instruction: string }[] };

export const KNOWLEDGE_SCENARIO_DEFINITIONS: readonly KnowledgeScenarioDefinition[] = [
  { id: "meeting", name: "Meeting", description: "Discussion, decisions, alignment, tensions, and unresolved issues", sections: [
    { key: "discussionTopics", title: "Discussion Topics", instruction: "Substantive topics discussed. For each, capture concrete positions, reasoning, evidence, constraints, and context—not merely the topic name." },
    { key: "decisions", title: "Decisions", instruction: "Explicit decisions or choices, including stated rationale, scope, conditions, and rejected alternatives. Do not turn proposals into decisions." },
    { key: "agreements", title: "Agreements & Alignment", instruction: "Points participants explicitly agreed on, including who agreed and any qualifications when stated." },
    { key: "disagreements", title: "Disagreements & Trade-offs", instruction: "Differing positions, objections, debated trade-offs, and each side's reasons. Preserve attribution when stated." },
    { key: "risks", title: "Risks & Issues", instruction: "Problems, blockers, dependencies, constraints, and risks, together with causes, impact, or mitigation discussed." },
    { key: "openQuestions", title: "Unresolved Questions", instruction: "Questions or issues left unresolved, including options, missing information, and why resolution was not reached." },
  ] },
  { id: "lecture", name: "Lecture", description: "Concepts, explanations, examples, relationships, and caveats", sections: [
    { key: "concepts", title: "Concepts & Definitions", instruction: "Concepts and terms actually taught. Define each from the note and include distinguishing features, conditions, or boundaries stated." },
    { key: "explanations", title: "Explanations & Reasoning", instruction: "How or why something works: mechanisms, processes, derivations, causal reasoning, and step-by-step explanations in the note." },
    { key: "examples", title: "Examples & Applications", instruction: "Concrete examples, demonstrations, cases, or applications, with what each illustrates and its relevant details." },
    { key: "relationships", title: "Relationships", instruction: "Explicit comparisons, contrasts, dependencies, hierarchies, sequences, cause/effect links, or relationships among concepts." },
    { key: "misunderstandings", title: "Misunderstandings & Caveats", instruction: "Misconceptions corrected, confusions, exceptions, limitations, caveats, or edge cases explicitly discussed." },
    { key: "openQuestions", title: "Unclear or Open Questions", instruction: "Questions left open and points explicitly needing clarification. Do not invent study questions." },
  ] },
  { id: "consultation", name: "Consultation", description: "Situation, professional guidance, rationale, options, and cautions", sections: [
    { key: "situation", title: "Situation & Concerns", instruction: "The user's concrete circumstances, symptoms or problems, history, goals, and concerns relevant to the consultation." },
    { key: "assessment", title: "Assessment", instruction: "The professional's stated interpretation or assessment, including supporting observations and uncertainty. Do not add a diagnosis or conclusion." },
    { key: "advice", title: "Advice & Rationale", instruction: "Recommendations actually given and their stated reasons, expected benefits, conditions, or instructions." },
    { key: "options", title: "Options & Trade-offs", instruction: "Alternative approaches discussed, including benefits, drawbacks, suitability, costs, or selection criteria stated for each." },
    { key: "constraints", title: "Constraints & Warnings", instruction: "Limitations, contraindications, risks, dependencies, warnings, or boundaries, with context and consequences." },
    { key: "uncertainties", title: "Unknowns to Clarify", instruction: "Facts, tests, inputs, or outcomes explicitly unknown or needing confirmation, including why they matter." },
  ] },
  { id: "interview", name: "Interview", description: "Perspectives, behavior, needs, motivations, and supported patterns", sections: [
    { key: "perspectives", title: "Perspectives & Beliefs", instruction: "The interviewee's specific viewpoints, beliefs, preferences, and reasoning, with the context in which they apply." },
    { key: "behaviors", title: "Behaviors & Context", instruction: "What the interviewee actually does or experiences: workflows, habits, environment, triggers, frequency, and circumstances." },
    { key: "needs", title: "Needs & Pain Points", instruction: "Goals, needs, frustrations, obstacles, and workarounds, including causes, impact, severity, or frequency when stated." },
    { key: "motivations", title: "Motivations & Decision Factors", instruction: "What drives choices or behavior, including priorities, success criteria, concerns, and trade-offs." },
    { key: "insights", title: "Supported Patterns", instruction: "Patterns supported by multiple statements. Prefix cautious synthesis with 'Inference:' (or the note's equivalent); do not add outside assumptions." },
    { key: "quotes", title: "Notable Quotes", instruction: "Short verbatim statements worth preserving, with speaker or context when available. Never fabricate or polish a quote." },
  ] },
  { id: "brainstorm", name: "Brainstorm", description: "Ideas, alternatives, connections, evaluation, and open questions", sections: [
    { key: "ideas", title: "Ideas", instruction: "Every distinct meaningful idea, including its purpose, mechanism, intended user or context, and elaborating details when stated." },
    { key: "alternatives", title: "Alternatives & Variations", instruction: "Alternative implementations, variants, combinations, or competing approaches explicitly suggested, with how they differ." },
    { key: "connections", title: "Connections & Themes", instruction: "Supported relationships among ideas: shared themes, combinations, dependencies, analogies, or one idea enabling another." },
    { key: "evaluation", title: "Pros, Cons & Criteria", instruction: "Benefits, drawbacks, feasibility, constraints, risks, and evaluation criteria. Attribute each evaluation to its idea." },
    { key: "promisingDirections", title: "Promising Directions", instruction: "Ideas explicitly favored, prioritized, or called promising, including the stated evidence or reason. Do not rank them yourself." },
    { key: "openQuestions", title: "Open Questions", instruction: "Unanswered questions, assumptions to test, missing information, and tensions raised. Do not invent follow-up tasks." },
  ] },
  { id: "general", name: "General", description: "Context, evidence, relationships, nuance, and reference details", sections: [
    { key: "background", title: "Background & Context", instruction: "Specific background, circumstances, actors, goals, and constraints needed beyond a generic summary." },
    { key: "details", title: "Supporting Details", instruction: "Concrete facts, evidence, observations, figures, examples, quotations, or references that add substance." },
    { key: "relationships", title: "Relationships & Reasoning", instruction: "Explicit causes, effects, comparisons, dependencies, sequences, arguments, and how information relates." },
    { key: "perspectives", title: "Perspectives & Nuance", instruction: "Distinct viewpoints, interpretations, qualifications, uncertainty, disagreements, exceptions, and caveats." },
    { key: "openQuestions", title: "Open Questions & Unknowns", instruction: "Questions explicitly raised or information explicitly missing or uncertain. Do not invent useful-sounding questions." },
  ] },
];

export function getKnowledgeScenarioDefinition(scenario: KnowledgeScenario) {
  return KNOWLEDGE_SCENARIO_DEFINITIONS.find((item) => item.id === scenario)!;
}
