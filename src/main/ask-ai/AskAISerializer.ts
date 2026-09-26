import { AIConversation } from '@shared/entities/AIConversation';
import { AIMessage } from '@shared/entities/AIMessage';
import { Note } from '@shared/entities/Note';
import {
  AskAIConversationDTO,
  AskAIMessageDTO,
  AskAINoteDTO,
} from './AskAITypes';

export function clipText(text: string, maxCharacters: number): string {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length <= maxCharacters
    ? normalized
    : `${normalized.slice(0, maxCharacters).trim()}...`;
}

export function serializeConversation(
  conversation: AIConversation,
): AskAIConversationDTO {
  return {
    id: conversation.getId(),
    name: conversation.getName(),
    createdAt: conversation.getCreatedAt().toISOString(),
    updatedAt: conversation.getUpdatedAt().toISOString(),
  };
}

export function serializeMessage(message: AIMessage): AskAIMessageDTO {
  return {
    id: message.getId(),
    conversationId: message.getConversationId(),
    role: message.getRole(),
    content: message.getContent(),
    createdAt: message.getCreatedAt().toISOString(),
  };
}

export function serializeNote(note: Note): AskAINoteDTO {
  return {
    id: note.getId(),
    workspaceId: note.getWorkspaceId(),
    name: note.getName() || `Note ${note.getId()}`,
    transcript: note.getTranscript(),
    transcriptPreview: clipText(note.getTranscript(), 180),
    updatedAt: note.getUpdatedAt().toISOString(),
  };
}

export function createConversationName(question: string): string {
  return clipText(question, 64) || 'Ask AI Conversation';
}
