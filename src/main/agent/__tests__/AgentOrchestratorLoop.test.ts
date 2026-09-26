import type { Message, Tool } from 'ollama';
import AgentOrchestrator from '../AgentOrchestrator';
import { AgentChatReply, AgentTool } from '../AgentTypes';

/**
 * 编排器的「外部约束」。
 *
 * 提示词里那几条（别重复调用、用完预算要作答）都是软的，
 * 小模型照样会违反。这里验证的是即便它违反，代码也不会失控。
 */

function makeTool(name: string, run: () => Promise<string>): AgentTool {
  return {
    schema: {
      type: 'function',
      function: { name, description: name, parameters: { type: 'object' } },
    } as Tool,
    run,
  };
}

/** 按脚本依次返回回复；脚本用完就一直返回最后一条。 */
function scriptedChat(replies: Message[]) {
  const seen: { messages: Message[]; tools: Tool[] }[] = [];
  let index = 0;
  const chat = async (
    messages: Message[],
    tools: Tool[],
  ): Promise<AgentChatReply> => {
    seen.push({ messages: [...messages], tools: [...tools] });
    const message = replies[Math.min(index, replies.length - 1)];
    index += 1;
    return { message, modelName: 'test-model' };
  };
  return { chat, seen };
}

const request = {
  instruction: '找一下物流相关的笔记',
  workspaceId: null,
  linkedNoteIds: [],
  history: [],
};

const toolCall = (name: string, args: Record<string, unknown>): Message =>
  ({
    role: 'assistant',
    content: '',
    tool_calls: [{ function: { name, arguments: args } }],
  }) as unknown as Message;

describe('重复调用短路', () => {
  it('同一工具同一参数第二次不再真正执行', async () => {
    let runCount = 0;
    const tool = makeTool('search_notes', async () => {
      runCount += 1;
      return 'result';
    });
    // 连着发两次一模一样的调用，第三次才作答
    const { chat } = scriptedChat([
      toolCall('search_notes', { query: '物流' }),
      toolCall('search_notes', { query: '物流' }),
      { role: 'assistant', content: '找到了' } as Message,
    ]);

    const result = await new AgentOrchestrator({
      chat,
      tools: [tool],
      maxSteps: 6,
    }).run(request);

    expect(runCount).toBe(1);
    expect(result.finalText).toBe('找到了');
  });

  it('参数顺序不同但内容相同也算重复', async () => {
    let runCount = 0;
    const tool = makeTool('search_notes', async () => {
      runCount += 1;
      return 'ok';
    });
    const { chat } = scriptedChat([
      toolCall('search_notes', { a: 1, b: 2 }),
      toolCall('search_notes', { b: 2, a: 1 }),
      { role: 'assistant', content: '完成' } as Message,
    ]);

    await new AgentOrchestrator({ chat, tools: [tool], maxSteps: 6 }).run(
      request,
    );

    expect(runCount).toBe(1);
  });

  it('参数不同则照常执行', async () => {
    let runCount = 0;
    const tool = makeTool('search_notes', async () => {
      runCount += 1;
      return 'ok';
    });
    const { chat } = scriptedChat([
      toolCall('search_notes', { query: '物流' }),
      toolCall('search_notes', { query: '合同' }),
      { role: 'assistant', content: '完成' } as Message,
    ]);

    await new AgentOrchestrator({ chat, tools: [tool], maxSteps: 6 }).run(
      request,
    );

    expect(runCount).toBe(2);
  });

  it('一直重复也不会跑满预算后无话可说', async () => {
    let runCount = 0;
    const tool = makeTool('search_notes', async () => {
      runCount += 1;
      return 'ok';
    });
    // 模型死循环发同一个调用，最后一步被收走工具后才作答
    const { chat } = scriptedChat([
      toolCall('search_notes', { query: 'x' }),
      toolCall('search_notes', { query: 'x' }),
      toolCall('search_notes', { query: 'x' }),
      { role: 'assistant', content: '只能说到这里' } as Message,
    ]);

    const result = await new AgentOrchestrator({
      chat,
      tools: [tool],
      maxSteps: 4,
    }).run(request);

    expect(runCount).toBe(1);
    expect(result.completed).toBe(true);
    expect(result.finalText).toBe('只能说到这里');
  });
});

describe('最后一步强制作答', () => {
  it('最后一轮不再向模型提供工具', async () => {
    const tool = makeTool('search_notes', async () => 'ok');
    const { chat, seen } = scriptedChat([
      toolCall('search_notes', { query: 'a' }),
      toolCall('search_notes', { query: 'b' }),
      { role: 'assistant', content: '收尾' } as Message,
    ]);

    await new AgentOrchestrator({ chat, tools: [tool], maxSteps: 3 }).run(
      request,
    );

    expect(seen).toHaveLength(3);
    expect(seen[0].tools).toHaveLength(1);
    expect(seen[1].tools).toHaveLength(1);
    // 第三轮（最后一步）工具列表被清空
    expect(seen[2].tools).toHaveLength(0);
  });

  it('撞上限时给出的是真答案而不是模板话', async () => {
    const tool = makeTool('search_notes', async () => 'ok');
    const { chat } = scriptedChat([
      toolCall('search_notes', { query: 'a' }),
      toolCall('search_notes', { query: 'b' }),
      { role: 'assistant', content: '根据已有信息，结论是……' } as Message,
    ]);

    const result = await new AgentOrchestrator({
      chat,
      tools: [tool],
      maxSteps: 3,
    }).run(request);

    expect(result.completed).toBe(true);
    expect(result.finalText).toContain('结论');
    expect(result.finalText).not.toContain('安全上限');
  });
});

describe('运行状态回灌', () => {
  it('每轮都带上剩余步数', async () => {
    const tool = makeTool('search_notes', async () => 'ok');
    const { chat, seen } = scriptedChat([
      toolCall('search_notes', { query: 'a' }),
      { role: 'assistant', content: '好了' } as Message,
    ]);

    await new AgentOrchestrator({ chat, tools: [tool], maxSteps: 4 }).run(
      request,
    );

    const state = seen[0].messages.filter((m) =>
      String(m.content).includes('[RUN STATE]'),
    );
    expect(state).toHaveLength(1);
    expect(String(state[0].content)).toContain('step 1 of 4');
  });

  it('第二轮把已调用过的工具列出来', async () => {
    const tool = makeTool('search_notes', async () => 'ok');
    const { chat, seen } = scriptedChat([
      toolCall('search_notes', { query: '物流' }),
      { role: 'assistant', content: '好了' } as Message,
    ]);

    await new AgentOrchestrator({ chat, tools: [tool], maxSteps: 4 }).run(
      request,
    );

    const latest = String(
      seen[1].messages
        .filter((m) => String(m.content).includes('[RUN STATE]'))
        .at(-1)!.content,
    );
    expect(latest).toContain('step 2 of 4');
    expect(latest).toContain('search_notes(query="物流")');
  });

  it('最后一步明确告知不再有工具', async () => {
    const tool = makeTool('search_notes', async () => 'ok');
    const { chat, seen } = scriptedChat([
      toolCall('search_notes', { query: 'a' }),
      { role: 'assistant', content: '好了' } as Message,
    ]);

    await new AgentOrchestrator({ chat, tools: [tool], maxSteps: 2 }).run(
      request,
    );

    const latest = String(
      seen[1].messages
        .filter((m) => String(m.content).includes('[RUN STATE]'))
        .at(-1)!.content,
    );
    expect(latest).toContain('FINAL STEP');
  });
});

describe('未注册工具', () => {
  it('调用不存在的工具不会崩，错误回灌给模型后继续', async () => {
    const tool = makeTool('search_notes', async () => 'ok');
    const { chat } = scriptedChat([
      toolCall('not_a_real_tool', {}),
      { role: 'assistant', content: '换个办法' } as Message,
    ]);

    const result = await new AgentOrchestrator({
      chat,
      tools: [tool],
      maxSteps: 4,
    }).run(request);

    expect(result.completed).toBe(true);
    const failed = result.steps.find(
      (step) => step.type === 'tool_result' && !step.ok,
    );
    expect(failed).toBeDefined();
  });
});

describe('用户关联笔记上下文', () => {
  it('首轮自动载入全部关联笔记，并且不开放全库搜索', async () => {
    const readIds: number[] = [];
    let searchCount = 0;
    const readNote: AgentTool = {
      schema: {
        type: 'function',
        function: {
          name: 'read_note',
          description: 'read note',
          parameters: { type: 'object' },
        },
      } as Tool,
      run: async (args) => {
        const id = Number(args.note_id);
        readIds.push(id);
        return JSON.stringify({
          id,
          name: id === 7 ? '站会' : '银行材料',
          transcript: id === 7 ? '明天站会可能迟到' : '需要打印营业执照',
        });
      },
    };
    const search = makeTool('search_notes', async () => {
      searchCount += 1;
      return '不应执行';
    });
    const { chat, seen } = scriptedChat([
      {
        role: 'assistant',
        content: '一篇说站会，另一篇说银行材料。',
      } as Message,
    ]);

    const result = await new AgentOrchestrator({
      chat,
      tools: [search, readNote],
    }).run({
      instruction: '说了什么',
      workspaceId: null,
      linkedNoteIds: [7, 9],
      history: [],
    });

    expect(readIds).toEqual([7, 9]);
    expect(searchCount).toBe(0);
    expect(seen[0].tools.map((tool) => tool.function.name)).not.toContain(
      'search_notes',
    );
    const firstMessages = seen[0].messages.map((message) =>
      String(message.content),
    );
    expect(firstMessages.join('\n')).toContain('[LINKED NOTE CONTEXT]');
    expect(firstMessages.join('\n')).toContain('明天站会可能迟到');
    expect(firstMessages.join('\n')).toContain('需要打印营业执照');
    expect(result.finalText).toContain('站会');
  });
});
