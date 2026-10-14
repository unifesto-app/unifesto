import { Injectable } from '@nestjs/common';
import { PmTaskStatus } from '@prisma/client';
import { PM_STATUSES, PmService } from './pm.service';

/**
 * Minimal MCP server (JSON-RPC 2.0 over Streamable HTTP, stateless, JSON
 * responses only). Covers what Claude Code and claude.ai need: initialize,
 * tools/list, tools/call, ping. No SDK: the protocol surface is this small.
 */

type Rpc = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: any;
};

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const str = { type: 'string' };
const status = { type: 'string', enum: PM_STATUSES };

const TOOLS = [
  {
    name: 'list_tasks',
    description:
      'List plan tasks. Filter by track key (e.g. "S", "P") and/or statuses. Start here to see what is next.',
    inputSchema: {
      type: 'object',
      properties: { track: str, statuses: { type: 'array', items: status } },
    },
  },
  {
    name: 'get_task',
    description:
      'One task by key (e.g. "P13") with its last 20 activity entries.',
    inputSchema: {
      type: 'object',
      properties: { key: str },
      required: ['key'],
    },
  },
  {
    name: 'upsert_task',
    description:
      'Create or update a task by key. Creating needs track + title. Use status DONE when work lands, IN_PROGRESS when you start. Never delete: use DROPPED and say why in notes.',
    inputSchema: {
      type: 'object',
      properties: {
        key: str,
        track: str,
        title: str,
        notes: str,
        status,
        owner: str,
        dueDate: {
          type: 'string',
          description: 'YYYY-MM-DD, or empty to clear',
        },
        sortOrder: { type: 'integer' },
      },
      required: ['key'],
    },
  },
  {
    name: 'add_note',
    description:
      'Append a line to the activity log, optionally on one task (e.g. "merged in #112, not deployed").',
    inputSchema: {
      type: 'object',
      properties: { message: str, key: str },
      required: ['message'],
    },
  },
  {
    name: 'upsert_track',
    description:
      'Create or rename a track (workstream), e.g. key "P", name "Marketing to 5.0.0".',
    inputSchema: {
      type: 'object',
      properties: { key: str, name: str, sortOrder: { type: 'integer' } },
      required: ['key', 'name'],
    },
  },
];

class ToolError extends Error {}

const need = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v.trim())
    throw new ToolError(`${name} is required`);
  return v.trim();
};
const opt = (v: unknown, name: string): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new ToolError(`${name} must be a string`);
  return v;
};
const asStatus = (v: unknown): PmTaskStatus | undefined => {
  if (v === undefined) return undefined;
  if (!PM_STATUSES.includes(v as PmTaskStatus)) {
    throw new ToolError(`status must be one of ${PM_STATUSES.join(', ')}`);
  }
  return v as PmTaskStatus;
};

@Injectable()
export class PmMcp {
  constructor(private readonly pm: PmService) {}

  /** Returns the JSON-RPC response, or null for notifications (HTTP 202). */
  async handle(msg: Rpc, actor: string): Promise<object | null> {
    if (msg?.id === undefined || msg.id === null) return null;
    const ok = (result: object) => ({ jsonrpc: '2.0', id: msg.id, result });
    const fail = (code: number, message: string) => ({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code, message },
    });

    switch (msg.method) {
      case 'initialize': {
        const asked = msg.params?.protocolVersion;
        return ok({
          protocolVersion: SUPPORTED_VERSIONS.includes(asked)
            ? asked
            : SUPPORTED_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'unifesto-pm', version: '1.0.0' },
          instructions:
            'Unifesto product plan (tracks + tasks). Read with list_tasks/get_task. When you finish work, set the task DONE and add_note with the PR. Never delete tasks.',
        });
      }
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: TOOLS });
      case 'tools/call':
        try {
          const data = await this.call(
            msg.params?.name,
            msg.params?.arguments ?? {},
            actor,
          );
          return ok({
            content: [{ type: 'text', text: JSON.stringify(data, null, 1) }],
          });
        } catch (e) {
          // Tool failures go back to the model as content, not protocol errors.
          const text = e instanceof Error ? e.message : String(e);
          return ok({ content: [{ type: 'text', text }], isError: true });
        }
      default:
        return fail(-32601, `Method not found: ${msg.method}`);
    }
  }

  private call(name: string, a: Record<string, unknown>, actor: string) {
    switch (name) {
      case 'list_tasks': {
        const statuses = Array.isArray(a.statuses)
          ? a.statuses.map(asStatus)
          : undefined;
        return this.pm.listTasks({
          trackKey: opt(a.track, 'track'),
          status: statuses as PmTaskStatus[] | undefined,
        });
      }
      case 'get_task':
        return this.pm.getTask(need(a.key, 'key'));
      case 'upsert_task': {
        const due = opt(a.dueDate, 'dueDate');
        if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due))
          throw new ToolError('dueDate must be YYYY-MM-DD');
        return this.pm.upsertTask(
          {
            key: need(a.key, 'key'),
            trackKey: opt(a.track, 'track'),
            title: opt(a.title, 'title'),
            notes: opt(a.notes, 'notes'),
            status: asStatus(a.status),
            owner: opt(a.owner, 'owner'),
            dueDate: due === undefined ? undefined : due || null,
            sortOrder:
              typeof a.sortOrder === 'number' ? a.sortOrder : undefined,
          },
          actor,
        );
      }
      case 'add_note':
        return this.pm.addNote(
          actor,
          need(a.message, 'message'),
          opt(a.key, 'key'),
        );
      case 'upsert_track':
        return this.pm.upsertTrack(
          need(a.key, 'key'),
          need(a.name, 'name'),
          typeof a.sortOrder === 'number' ? a.sortOrder : undefined,
        );
      default:
        throw new ToolError(`Unknown tool: ${name}`);
    }
  }
}
