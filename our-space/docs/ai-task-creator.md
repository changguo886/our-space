# AI Task Creator

Describe a task in one sentence at the top of the Create Task panel. AI fills the
same form you use manually: type, dates, routine rule and steps. You review and
edit everything there, then press Create. Nothing is saved until you do.

## Flow

1. `components/ai/AITaskCreator.tsx` posts the description to `/api/ai/task-draft`.
2. The route (`app/api/ai/task-draft/route.ts`) checks the session, rate-limits per user,
   and asks the model for JSON matching `TASK_DRAFT_SCHEMA`.
3. `normalizeDraft()` (`lib/ai/task-draft.ts`) repairs the draft so it always satisfies
   the database constraints (project date order, `habit_patterns_v3_consistent`,
   subtask title/minutes). Anything it changed is shown to the user as a short note.
4. `AddTodoForm.applyDraft()` fills the form. Steps appear in `TaskStepsEditor`
   (add, edit, reorder, delete, minutes), which manual creation uses too.
   If the form already has the user's own input, nothing is overwritten: they choose
   to replace it with the draft, add only the draft's new steps, or cancel.
5. On Create, `save_task_v4` saves the task. Steps are then inserted into
   `todo_subtasks` in one statement (`source` = `ai` or `manual`). If that fails,
   the existing retry banner offers to save them again, like color, sharing and journey.

No database migration is needed.

## Setup

In `our-space/.env.local` (never commit it, never use a `NEXT_PUBLIC_` prefix):

```
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-mini   # optional
```

The provider call lives only in `lib/ai/provider.ts`; switching vendors touches that file.

## Tuning

- Prompt and few-shot example: `buildInstructions()` in `lib/ai/task-draft.ts`.
- Normalization rules are covered by `tests/ai-task-draft.test.mjs` (`npm test`).
- The rate limiter is in-memory per server instance. That is fine for a private app;
  use a shared store before any public release.
