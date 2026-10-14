# Development rule: schema walkthrough and risk check for every feature

Before implementing any new Our Space feature, briefly walk through:
1. Existing tables and their parent/child FK links affected.
2. Existing RPC/functions, RLS policies, triggers and Web/Tauri callers affected.
3. New fields/tables: why needed, canonical ownership, avoid duplicates.
4. Data safety: impact of delete/cascade/SET NULL, backward compatibility and actual Focus history.
5. Future extension and rollback: reversible migration steps, backups, test scenarios.
6. After release: mark old interfaces retired only when no clients call them.

For discussion, explain these in accessible terms (tables / references / service functions) and keep implementation batches substantial rather than repeatedly drip-feeding changes. Preserve the agreed Todo-level Quick Notes panel, standalone Tauri UI, and V4 task types one_time/project/routine.

Note: this repository document is project guidance, not a claim of ChatGPT account memory persistence.
