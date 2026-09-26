import { useTranslation } from 'react-i18next';

/**
 * 模型管理页的加载骨架。
 *
 * 用骨架而不是一个居中的转圈：骨架把「马上会出现什么、在哪儿」提前画出来，
 * 内容到位时是填充而不是整页跳一下，观感上比纯 spinner 快得多。
 * 形状刻意和 .model-module 对齐（图标 + 标题 + 下拉 + 运行时行）。
 */
export default function ModelModuleSkeleton() {
  const { t } = useTranslation();

  return (
    <div
      className="model-module-list"
      role="status"
      aria-busy="true"
      aria-label={t('modelManager.loading')}
    >
      {['stt', 'tts', 'embedding', 'llm'].map((key) => (
        <section className="model-module model-module--skeleton" key={key}>
          <header className="model-module-head">
            <span className="model-skeleton model-skeleton--icon" />
            <span className="model-skeleton model-skeleton--title" />
          </header>
          <span className="model-skeleton model-skeleton--select" />
          <span className="model-skeleton model-skeleton--runtime" />
        </section>
      ))}
    </div>
  );
}
