# V3 atomic habit write implementation gate

Status: migration pending; no SQL executed.

Goal: one database transaction must create/update the parent Todo, canonical `habit_patterns_v3`, and optional goals. A later failure must not leave a half-created habit.

API contract proposal: `save_habit_v3(payload jsonb, todo_id uuid default null) -> uuid`. Use authenticated caller, security invoker, and Todo ownership checks. Reject invalid dates, weekdays, month days, counts, and group membership; never trust passed user_id. A failed write rolls back its entire transaction.

Before writing executable RPC: inspect live constraints on `task_goal_settings(todo_id)`. Upsert requires a unique constraint. If not unique, add one only after duplicate-row audit. Verify `habit_patterns_v3` RLS, Todo insert/update ownership, category nullability, and date semantics. Do not replace existing RPC until all clients move.

After deploying new RPC: migrate AddTodoForm (all daily/weekly/monthly habits) from old split inserts, then Todo editor to the same RPC; remove legacy split writes only after full CRUD tests. Never run application code requiring the new RPC before migration is applied.

Recurring time templates, exceptions and Calendar expansion are separate later stages. Mini Focus interfaces remain unchanged until regression testing.
