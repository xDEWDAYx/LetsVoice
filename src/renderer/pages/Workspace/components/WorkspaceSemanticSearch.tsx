import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  EmbeddingModelStatus,
  SemanticNoteResult,
} from '@shared/types/SemanticTypes';
import WorkspaceSemanticController from '../WorkspaceSemanticController';

const controller = new WorkspaceSemanticController();

type Props = {
  query: string;
  workspaceId: number;
  onSelect(noteId: number): void;
};

/** 语义搜索由按钮显式触发，避免用户每输入一个字符就运行本地模型。 */
export default function WorkspaceSemanticSearch({
  query,
  workspaceId,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<EmbeddingModelStatus | null>(null);
  const [results, setResults] = useState<SemanticNoteResult[]>([]);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    controller
      .getStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const search = async () => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    try {
      setLoading(true);
      setError('');
      setResults(await controller.search(cleanQuery, workspaceId));
      setSearchedQuery(cleanQuery);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('workspace.search.error'),
      );
    } finally {
      setLoading(false);
    }
  };

  // 作为工具条的一员渲染：控件与关键词搜索框同一行，结果另起一整行。
  return (
    <>
      <div className="workspace-semantic-control">
        {status?.installed ? (
          <button
            className="ws-btn"
            disabled={!query.trim() || loading}
            onClick={search}
            title={t('workspace.search.title')}
            type="button"
          >
            {loading
              ? t('workspace.search.indexing')
              : t('workspace.search.button')}
          </button>
        ) : (
          <Link
            className="ws-link"
            title={t('workspace.search.needModel')}
            to="/ModelManagement"
          >
            {t('workspace.search.installModel')}
          </Link>
        )}
      </div>
      {error && (
        <p className="workspace-semantic-error" role="alert">
          {error}
        </p>
      )}
      {searchedQuery && !error && (
        <div className="workspace-semantic-results">
          <span>
            「{searchedQuery}」· {results.length}{' '}
            {t('workspace.detail.noteCount')}
          </span>
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => onSelect(result.id)}
              type="button"
            >
              <strong>{result.name}</strong>
              <small>
                {Math.round(result.score * 100)}%{' '}
                {t('workspace.search.similarity')}
              </small>
              <span>{result.transcriptPreview}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
