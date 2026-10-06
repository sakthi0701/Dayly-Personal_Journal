/**
 * lib/telegram-agent/tools.ts
 *
 * Tool definitions for the Dayly Telegram AI Agent.
 * These are passed to the Tier 1 (20b) router model via Groq's function-calling API.
 * Each tool maps to a specific Supabase operation in executor.ts.
 */

export type ToolName =
  | 'log_habits'
  | 'complete_tasks'
  | 'complete_pressure_tasks'
  | 'add_tasks'
  | 'add_pressure_tasks'
  | 'log_journal'
  | 'get_stats'
  | 'set_reminder'
  | 'list_reminders'
  | 'delete_reminder';

export const AGENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'log_habits' as ToolName,
      description:
        'Mark one or more habits as done, failed, or skipped. Use when user says they completed, skipped, or failed habits. ' +
        'Examples: "done with meditation", "skipping exercise today", "couldn\'t meditate".',
      parameters: {
        type: 'object',
        properties: {
          habits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                habit_name: {
                  type: 'string',
                  description: 'Name or partial name of the habit as the user said it.',
                },
                status: {
                  type: 'string',
                  enum: ['success', 'failed', 'skipped'],
                  description: 'success = completed, failed = tried but couldn\'t, skipped = intentionally not doing it today.',
                },
              },
              required: ['habit_name', 'status'],
            },
          },
        },
        required: ['habits'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'complete_tasks' as ToolName,
      description:
        'Mark one or more regular tasks as done. Use when user says they finished, completed, or done with tasks from their task list. ' +
        'Examples: "finished writing the report", "done with the API task", "completed auth flow".',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                task_name: {
                  type: 'string',
                  description: 'Name or partial name of the task as the user described it.',
                },
              },
              required: ['task_name'],
            },
          },
        },
        required: ['tasks'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'complete_pressure_tasks' as ToolName,
      description:
        'Mark one or more pressure plan tasks as done. Use when the task sounds urgent or deadline-driven. ' +
        'If unsure whether it\'s a regular task or pressure task, prefer complete_tasks.',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                task_name: {
                  type: 'string',
                  description: 'Name or partial name of the pressure task.',
                },
              },
              required: ['task_name'],
            },
          },
        },
        required: ['tasks'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_tasks' as ToolName,
      description:
        'Create one or more new tasks. Use when user wants to add something to their task list. ' +
        'Examples: "add tasks: write unit tests, fix bugs", "remind me to call doctor", "new task: review PR".',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Task title.' },
                due_date: {
                  type: 'string',
                  description: 'ISO date YYYY-MM-DD. Only set if user explicitly mentions a date.',
                },
                priority: {
                  type: 'string',
                  enum: ['urgent', 'high', 'medium', 'low', 'none'],
                  description: 'Task priority. Default to "none" unless user specifies urgency.',
                },
              },
              required: ['title'],
            },
          },
        },
        required: ['tasks'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_pressure_tasks' as ToolName,
      description:
        'Create one or more urgent/deadline-driven pressure tasks. Use when user mentions urgency, deadlines, or it sounds like a high-stakes item. ' +
        'Examples: "urgent: submit report by 3pm", "pressure task: client demo tomorrow".',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Pressure task title.' },
                deadline: {
                  type: 'string',
                  description:
                    'ISO datetime. Date only (YYYY-MM-DD) if no time specified. ' +
                    'With time: YYYY-MM-DDTHH:MM:00. Use IST time as-is.',
                },
                priority: {
                  type: 'number',
                  description: '1=critical, 2=high, 3=medium. Default 2.',
                },
              },
              required: ['title'],
            },
          },
        },
        required: ['tasks'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'log_journal' as ToolName,
      description:
        'Save a journal entry. Use for ANY reflective thought, feeling, life update, observation, emotional state, or day recap. ' +
        'When in doubt — if it sounds personal and not a task/habit — log it as a journal entry. ' +
        'The journal captures the story of the user\'s life.',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The exact content to save. Use the user\'s own words.',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_stats' as ToolName,
      description:
        'Fetch the user\'s XP, level, streak, and focus time. ' +
        'Use when user asks about their stats, progress, how they\'re doing, their level.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_reminder' as ToolName,
      description:
        'Create a one-time or recurring reminder that gets sent to the user via Telegram at the specified time. ' +
        'Examples: "remind me at 3pm today to take medicine", "set daily reminder at 8am to review tasks".',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Short memorable name for this reminder. E.g. "medicine", "daily review".' },
          message: { type: 'string', description: 'The message to send when the reminder fires.' },
          remind_at_ist: {
            type: 'string',
            description: 'ISO datetime in IST when to send: YYYY-MM-DDTHH:MM:00. Required.',
          },
          is_recurring: {
            type: 'boolean',
            description: 'True if this should repeat.',
          },
          recur_every_minutes: {
            type: 'number',
            description: 'How often to repeat in minutes. 60=hourly, 1440=daily, 10080=weekly.',
          },
        },
        required: ['label', 'message', 'remind_at_ist'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_reminders' as ToolName,
      description: 'List all active reminders. Use when user asks to see their reminders.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_reminder' as ToolName,
      description: 'Deactivate/delete a reminder by label. Use when user says to cancel, remove, or delete a reminder.',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Label or partial name of the reminder to delete.' },
        },
        required: ['label'],
      },
    },
  },
];
