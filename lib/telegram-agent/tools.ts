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
  | 'delete_reminder'
  | 'start_focus_timer'
  | 'start_break_timer'
  | 'stop_timer'
  | 'read_journal'
  | 'update_task'
  | 'update_pressure_task'
  | 'update_goal';

/** Shared by add_tasks + update_task. Bullet format: a one-sentence summary dropped real steps in testing. */
const NOTES_PARAM_DESCRIPTION =
  'Task notes summarising what the user said about this task, as "- " bullet lines separated by newlines, ' +
  'one concrete point per line: the goal/why, each step or thing to check, people involved, links, deadlines, constraints. ' +
  'Keep EVERY concrete detail they mentioned; drop filler; never invent steps. Omit if they gave no details.';

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
                notes: {
                  type: 'string',
                  description: NOTES_PARAM_DESCRIPTION,
                },
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
        'Save a journal entry. Use when the user says "log ...", "journal ...", "note that ..." (and it is not a habit/task), ' +
        'and for ANY reflective thought, feeling, life update, observation, emotional state, or day recap. ' +
        'When in doubt — if it sounds personal and not a task/habit — log it as a journal entry. ' +
        'NEVER for requests to see/show/read the journal (e.g. "today\'s journal log", "what did I write") — use read_journal. ' +
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
        'Fetch the user\'s coins, streak, and focus time. ' +
        'Use when user asks about their stats, progress, coins, or how they\'re doing.',
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
  {
    type: 'function' as const,
    function: {
      name: 'start_focus_timer' as ToolName,
      description:
        'Start a Pomodoro focus timer in the Dayly app (it shows up running when the user opens the app). ' +
        'Examples: "start a focus timer of 25 minutes", "focus 50 min on DSA", "start pomodoro". ' +
        'ONLY set focus_on if the user has said what they are focusing on (in this message, or as their reply to ' +
        '"what are you focusing on?"). Never guess it. If they have not said, call with minutes only.',
      parameters: {
        type: 'object',
        properties: {
          minutes: { type: 'number', description: 'Session length in minutes. Default 25.' },
          focus_on: {
            type: 'string',
            description: 'What the user is focusing on, in their words (e.g. "DSA"). Omit if not stated.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'start_break_timer' as ToolName,
      description:
        'Start a break timer in the Dayly app. Examples: "start a break", "5 min break", "take a 15 minute break".',
      parameters: {
        type: 'object',
        properties: {
          minutes: { type: 'number', description: 'Break length in minutes. Default 5.' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stop_timer' as ToolName,
      description:
        'Stop the focus or break timer that was started from Telegram. Examples: "stop the timer", "cancel my focus session", "end break".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_journal' as ToolName,
      description:
        'Show the user what is in their journal for a day. Use when they ask to see, show, read or send their journal. ' +
        'Examples: "today\'s journal log", "show my journal", "what did I journal yesterday", "send me 3 Nov journal".',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'IST date YYYY-MM-DD. Omit for today. Resolve "yesterday" etc. from CURRENT TIME.',
          },
        },
      },
    },
  },
];

/**
 * Edit tools — currently exposed to Sensei voice calls only (see lib/voice/prompt.ts).
 * Kept out of AGENT_TOOLS so the Telegram router's behaviour doesn't change; add them
 * there deliberately (with routing rules in pipeline.ts) if Telegram should edit too.
 * Status changes are NOT here on purpose: completion goes through complete_* tools.
 */
export const EDIT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'update_task' as ToolName,
      description:
        'Edit an existing open task: rename it, add to or rewrite its notes, change its due date, priority or pomodoro estimate. ' +
        'Examples: "add to the API task notes that we use AES", "move the report to Friday", "make the bug fix urgent".',
      parameters: {
        type: 'object',
        properties: {
          task_name: { type: 'string', description: 'Current name or partial name of the task.' },
          new_title: { type: 'string', description: 'New title. Omit to keep the current one.' },
          notes: {
            type: 'string',
            description: `${NOTES_PARAM_DESCRIPTION} Omit to leave notes unchanged.`,
          },
          notes_mode: {
            type: 'string',
            enum: ['append', 'replace'],
            description: '"append" (default) adds below existing notes. "replace" only if the user asks to rewrite or clear the notes.',
          },
          due_date: { type: 'string', description: 'New due date, ISO YYYY-MM-DD.' },
          priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low', 'none'] },
          estimated_pomodoros: { type: 'number', description: 'New estimate in 25-minute pomodoros.' },
        },
        required: ['task_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_pressure_task' as ToolName,
      description:
        'Edit an existing open pressure task: rename it, change its deadline, priority or time estimate.',
      parameters: {
        type: 'object',
        properties: {
          task_name: { type: 'string', description: 'Current name or partial name of the pressure task.' },
          new_title: { type: 'string', description: 'New title. Omit to keep the current one.' },
          deadline: {
            type: 'string',
            description: 'New deadline. YYYY-MM-DD, or YYYY-MM-DDTHH:MM:00 with a time (IST as-is).',
          },
          priority: { type: 'number', description: '1=critical, 2=high, 3=medium.' },
          estimated_minutes: { type: 'number', description: 'New time estimate in minutes.' },
        },
        required: ['task_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_goal' as ToolName,
      description: 'Edit an active goal: rename it or change its deadline.',
      parameters: {
        type: 'object',
        properties: {
          goal_name: { type: 'string', description: 'Current name or partial name of the goal.' },
          new_title: { type: 'string', description: 'New title. Omit to keep the current one.' },
          deadline: { type: 'string', description: 'New deadline, ISO YYYY-MM-DD.' },
        },
        required: ['goal_name'],
      },
    },
  },
];
