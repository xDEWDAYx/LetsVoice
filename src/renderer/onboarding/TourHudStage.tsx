import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HUD_EDGE_MARGIN, HUD_SIZES, HudKind } from '@shared/hud/HudLayout';
import { HudFrame } from '../hud/HudShell';
import { StatsHudView } from '../hud/StatsHud';
import { TodoHudView } from '../hud/TodoHud';
import { RecordHudView } from '../hud/RecordHud';
import {
  buildHudMetrics,
  hasAnyMetric,
  HudMetric,
  metricsFromOverview,
} from '../hud/HudMetrics';
import {
  HudTodo,
  HudTodoGroup,
  hudTodoCount,
  nextDateKey,
  selectHudTodos,
  toDateKey,
  todosFromOverview,
} from '../hud/HudTodoSelection';

/**
 * 引导里那三步的「实物」浮窗。
 *
 * 讲快捷键的时候光说「右下角会弹出一张卡片」是没用的：那三个浮窗是独立窗口，
 * 聚光灯打不到，用户按快捷键之前根本不知道会冒出个什么东西。所以这里把真正的
 * 浮窗照原样摆出来——同一套组件、同一份 CSS、同样的尺寸、同样贴在右下角
 * （录音条同样是下方居中）。用户在引导里看到的，就是他之后按下快捷键看到的。
 *
 * 数据也用真的：能取到就显示用户自己的笔记数和待办。刚装好、库里还是空的时候
 * 才退回一组示例，否则四个空环和一句「没有待办」什么也讲不明白。
 *
 * 它带着 data-tour="hud-demo"，所以聚光灯和说明卡会像对待普通控件一样围住它。
 * 但整块是 pointer-events: none —— 引导里点一下就把某条待办真勾掉，那是意外，
 * 不是教学。
 */

/** 库里空空如也时用的示例数字，够撑出四个不一样长的环。 */
const SAMPLE_METRICS = buildHudMetrics({
  notes: 18,
  pinned: 4,
  todos: 6,
  words: 9200,
});

type Overview = Parameters<typeof metricsFromOverview>[0] &
  Parameters<typeof todosFromOverview>[0];

/**
 * 取一次仪表板数据。取不到就算了，下面自会退回示例。
 *
 * loaded 要单独回一个：数据没到之前不能先摆示例，否则用户会先看见一组
 * 假数字、再「啪」地跳成自己的。没到就跟真浮窗一样什么都不画。
 */
function useOverview(): { overview: Overview; loaded: boolean } {
  const [state, setState] = useState<{ overview: Overview; loaded: boolean }>({
    overview: null,
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(window.electron?.dashboard?.getDashboardOverview?.())
      .then((data) => {
        if (!cancelled)
          setState({ overview: (data ?? null) as Overview, loaded: true });
        return null;
      })
      .catch(() => {
        if (!cancelled) setState({ overview: null, loaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function sampleTodos(label: (index: number) => string): HudTodoGroup {
  const today = toDateKey(new Date());
  const tomorrow = nextDateKey(today);
  const make = (
    index: number,
    dateString: string,
    isPinned = false,
  ): HudTodo => ({
    id: -(index + 1),
    noteId: -1,
    title: label(index),
    dateString,
    isCompleted: false,
    isPinned,
  });
  // 置顶的那条放在「明天」组：置顶行在自己组里会排到最前，摆在今天组的话
  // 第一行就成了已置顶状态，而那一行的图钉不参与呼吸提示（它本来就常亮），
  // 新用户就永远看不到「这个图钉是能按的」。
  return {
    today: [make(0, today), make(1, today)],
    tomorrow: [make(2, tomorrow, true)],
  };
}

function StatsStage() {
  const { overview, loaded } = useOverview();
  const metrics = useMemo(() => {
    if (!loaded) return null;
    const real = metricsFromOverview(overview);
    return hasAnyMetric(real) ? real : SAMPLE_METRICS;
  }, [overview, loaded]);

  // 先按 0 画一帧，下一拍再给真值：.hud-ring-fill 上本来就有
  // stroke-dasharray 的过渡，这样四个环会自己「长」出来，
  // 而不是一上来就摆在那儿。
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    setDrawn(false);
    const timer = window.setTimeout(() => setDrawn(true), 80);
    return () => window.clearTimeout(timer);
  }, [metrics]);

  const shown: HudMetric[] | null =
    !metrics || drawn
      ? metrics
      : metrics.map((metric) => ({ ...metric, ratio: 0 }));

  return <StatsHudView metrics={shown} />;
}

function TodosStage() {
  const { t } = useTranslation();
  const { overview, loaded } = useOverview();

  const group = useMemo(() => {
    if (!loaded) return null;
    const real = selectHudTodos(
      todosFromOverview(overview),
      toDateKey(new Date()),
    );
    if (hudTodoCount(real) > 0) return real;
    return sampleTodos((index) =>
      t(`onboarding.tour.hudTodos.sample${'ABC'[index]}`),
    );
  }, [overview, loaded, t]);

  const noop = () => {};

  return (
    <TodoHudView
      actions={{ onComplete: noop, onTogglePin: noop, onOpen: noop }}
      group={group}
    />
  );
}

const NOOP = () => {};

export default function TourHudStage({ kind }: { kind: HudKind }) {
  const size = HUD_SIZES[kind];

  return (
    <div
      className={`tour-hud-stage tour-hud-stage--${kind}`}
      data-tour="hud-demo"
      style={{
        width: size.width,
        height: size.height,
        // 边距从落点算法那儿来，浮窗真的就摆在这个位置
        ...(kind === 'record'
          ? { bottom: 0 }
          : { right: HUD_EDGE_MARGIN, bottom: HUD_EDGE_MARGIN }),
      }}
    >
      <HudFrame kind={kind}>
        {kind === 'stats' && <StatsStage />}
        {kind === 'todos' && <TodosStage />}
        {kind === 'record' && <RecordHudView onCancel={NOOP} onDone={NOOP} />}
      </HudFrame>
    </div>
  );
}
