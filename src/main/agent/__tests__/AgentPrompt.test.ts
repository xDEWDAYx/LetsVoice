import {
  buildAgentSystemPrompt,
  buildDuplicateCallNotice,
  buildRunStateMessage,
} from '../AgentPrompt';

describe('分层系统提示词', () => {
  const prompt = buildAgentSystemPrompt({
    workspaceId: null,
    linkedNoteIds: [],
  });

  it('文首写明冲突时按层级编号裁决', () => {
    expect(prompt).toContain('RULE PRECEDENCE');
    expect(prompt).toContain('SMALLER layer number wins');
  });

  it('六个层级齐全且按序出现', () => {
    const order = ['[L0]', '[L1]', '[L2]', '[L3]', '[L4]', '[L5]'];
    const positions = order.map((tag) => prompt.indexOf(tag));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('每层都标出作用域', () => {
    expect(prompt.match(/适用范围 \/ scope:/g)).toHaveLength(6);
  });

  it('规则带层级编号，便于模型自我定位', () => {
    expect(prompt).toContain('L1.1');
    expect(prompt).toContain('L2.1');
  });

  it('L1 覆盖不可编造与不泄露推理', () => {
    expect(prompt).toContain('Never invent note ids');
    expect(prompt).toContain('private reasoning');
  });

  it('明确 L5 不能压过 L1', () => {
    expect(prompt).toContain('L5 is context, not permission');
  });
});

describe('会话作用域层（L5）', () => {
  it('不限定工作区时说明可检索全部笔记', () => {
    const prompt = buildAgentSystemPrompt({
      workspaceId: null,
      linkedNoteIds: [],
    });
    expect(prompt).toContain('ALL saved notes across every workspace');
  });

  it('限定工作区时带上工作区编号', () => {
    const prompt = buildAgentSystemPrompt({
      workspaceId: 42,
      linkedNoteIds: [],
    });
    expect(prompt).toContain('workspace 42');
  });

  it('挂上的笔记成为本轮明确范围', () => {
    const prompt = buildAgentSystemPrompt({
      workspaceId: null,
      linkedNoteIds: [7, 9],
    });
    expect(prompt).toContain('7, 9');
    expect(prompt).toContain('complete note scope');
    expect(prompt).toContain('[LINKED NOTE CONTEXT]');
    expect(prompt).toContain('do not search other notes');
    expect(prompt).not.toContain(
      'Search scope: ALL saved notes across every workspace',
    );
  });

  it('没挂笔记时不留空行占位', () => {
    const prompt = buildAgentSystemPrompt({
      workspaceId: null,
      linkedNoteIds: [],
    });
    expect(prompt).not.toContain('explicitly selected note ids');
  });
});

describe('运行状态回灌', () => {
  it('普通轮次报出步数与剩余', () => {
    const message = buildRunStateMessage({
      step: 2,
      maxSteps: 6,
      previousCalls: [],
      finalStep: false,
    });
    expect(message).toContain('step 2 of 6');
    expect(message).toContain('4 remaining');
    expect(message).toContain('No tools called yet');
  });

  it('列出已调用过的工具并要求不要重复', () => {
    const message = buildRunStateMessage({
      step: 3,
      maxSteps: 6,
      previousCalls: ['search_notes(query="物流")'],
      finalStep: false,
    });
    expect(message).toContain('search_notes(query="物流")');
    expect(message).toContain('Do not repeat');
  });

  it('最后一步说明没有工具可用，必须作答', () => {
    const message = buildRunStateMessage({
      step: 6,
      maxSteps: 6,
      previousCalls: ['a()'],
      finalStep: true,
    });
    expect(message).toContain('FINAL STEP');
    expect(message).toContain('no tools are available');
    expect(message).toContain('what is still missing');
  });
});

describe('重复调用提示', () => {
  it('说明没有再执行，并给出下一步选择', () => {
    const notice = buildDuplicateCallNotice('search_notes(query="x")');
    expect(notice).toContain('search_notes(query="x")');
    expect(notice).toContain('not executed again');
    expect(notice).toContain('answer now');
  });
});
