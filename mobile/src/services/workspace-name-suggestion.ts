import type { Note } from "@/domain/note/note";
import type { Workspace } from "@/domain/workspace/workspace";

export const WORKSPACE_SUGGESTION_NAMES = [
  "Meeting",
  "Study",
  "Research",
  "Project",
  "Ideas",
] as const;

export type WorkspaceSuggestionName = (typeof WORKSPACE_SUGGESTION_NAMES)[number];

export type WorkspaceNameSuggestion = {
  action: "create" | "rename";
  name: WorkspaceSuggestionName;
  reason: string;
  workspaceId: string | null;
};

const KEYWORDS: Record<WorkspaceSuggestionName, readonly string[]> = {
  Meeting: ["meeting", "standup", "stand-up", "agenda", "client call", "team call", "会议", "开会", "议程"],
  Study: ["study", "lecture", "course", "exam", "tutorial", "lesson", "学习", "课程", "考试", "讲座"],
  Research: ["research", "paper", "experiment", "dataset", "hypothesis", "literature", "研究", "论文", "实验", "数据集"],
  Project: ["project", "milestone", "sprint", "roadmap", "deadline", "release", "implementation", "项目", "里程碑", "开发", "发布"],
  Ideas: ["brainstorm", "idea", "concept", "what if", "prototype", "创意", "想法", "头脑风暴", "点子"],
};

const CATEGORY_SCORE: Partial<Record<ReturnType<Note["getCategory"]>, WorkspaceSuggestionName>> = {
  meeting: "Meeting",
  learning: "Study",
  idea: "Ideas",
};

function isGenericWorkspaceName(value: string): boolean {
  return value.trim().toLocaleLowerCase() === "my workspace";
}

export function suggestWorkspaceName(
  workspaces: readonly Workspace[],
  notes: readonly Note[],
): WorkspaceNameSuggestion | null {
  if (workspaces.length > 1) return null;
  const genericWorkspace = workspaces[0] ?? null;
  if (genericWorkspace && !isGenericWorkspaceName(genericWorkspace.getName())) return null;
  if (!notes.length) return null;

  const scores = new Map<WorkspaceSuggestionName, number>(
    WORKSPACE_SUGGESTION_NAMES.map((name) => [name, 0]),
  );
  for (const note of [...notes]
    .sort((left, right) => right.getUpdatedAt().localeCompare(left.getUpdatedAt()))
    .slice(0, 20)) {
    const categoryName = CATEGORY_SCORE[note.getCategory()];
    if (categoryName) scores.set(categoryName, (scores.get(categoryName) ?? 0) + 3);
    const corpus = `${note.getName() ?? ""}\n${note.getTranscript()}`.toLocaleLowerCase();
    for (const name of WORKSPACE_SUGGESTION_NAMES) {
      if (KEYWORDS[name].some((keyword) => corpus.includes(keyword))) {
        scores.set(name, (scores.get(name) ?? 0) + 2);
      }
    }
  }

  const ranked = [...scores.entries()].sort(
    ([leftName, leftScore], [rightName, rightScore]) =>
      rightScore - leftScore ||
      WORKSPACE_SUGGESTION_NAMES.indexOf(leftName) - WORKSPACE_SUGGESTION_NAMES.indexOf(rightName),
  );
  const [name, score] = ranked[0];
  if (score < 2) return null;

  return {
    action: genericWorkspace ? "rename" : "create",
    name,
    reason: `Recent note names, categories, and transcript keywords most often match ${name.toLocaleLowerCase()} work.`,
    workspaceId: genericWorkspace?.getId() ?? null,
  };
}
