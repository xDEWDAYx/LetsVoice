import { NoteRepository } from '../database/repositories/NoteRepository';
import { TodoRepository } from '../database/repositories/TodoRepository';
import { TodoExtractionService } from '../dashboard/TodoExtractionService';
import SemanticNoteService from '../semantic/SemanticNoteService';
import createAgentExtractTodosTool, {
  TodoExtractor,
  TodoSource,
} from './AgentExtractTodosTool';
import createAgentReadNoteTool from './AgentReadNoteTool';
import createAgentSearchNotesTool from './AgentSearchNotesTool';
import { AgentNoteSource } from './AgentNoteToolSupport';
import { AgentTool } from './AgentTypes';

type AgentNoteToolDependencies = {
  notes?: AgentNoteSource;
  semantic?: Pick<SemanticNoteService, 'search'>;
  todoExtractor?: TodoExtractor;
  todos?: TodoSource;
};

/** 组合 Agent 的笔记工具；后续新增工具时保持独立文件。 */
export default function createAgentNoteTools(
  dependencies: AgentNoteToolDependencies = {},
): AgentTool[] {
  const notes = dependencies.notes ?? new NoteRepository();
  const semantic = dependencies.semantic ?? new SemanticNoteService();
  const todoExtractor =
    dependencies.todoExtractor ?? new TodoExtractionService();
  const todos = dependencies.todos ?? new TodoRepository();
  return [
    createAgentSearchNotesTool(notes, semantic),
    createAgentReadNoteTool(notes),
    createAgentExtractTodosTool(notes, todoExtractor, todos),
  ];
}
