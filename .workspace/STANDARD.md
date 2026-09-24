<!-- workspace-standard:1; generated from development-setup/templates/STANDARD.md -->
# Workspace standard

This file is generated from the shared development-setup repository. Put project
facts in AGENTS.md and DEVELOPMENT.md; do not maintain a second vendor-specific manual.

- Source, tests, technical contracts and deployment procedures belong in this repository.
- Shared business/operational knowledge belongs in the relevant Context folder.
- Customer exports, invoices, transcripts and private databases belong in Data, outside Git.
- Credentials come from the project's documented local environment or credential provider.
  Never print values or copy production configuration into worktrees by default.
- Read AGENTS.md and DEVELOPMENT.md before changing the project. Preserve unrelated work.
- Document actual component-specific setup and verification commands. Check them before use;
  a command name does not establish that it is safe or that its services are isolated.
- Run focused checks and the relevant final gate. UI work requires the running journey,
  phone/desktop inspection and appropriate accessibility checks; device work needs native tests.
- Treat absent services, skipped checks and zero collected tests as limitations, not passes.
- Publishing, pushing, deployment, account/credential changes and live writes require authorization.
- Keep technical documentation current in the same change as the implementation. Link to one
  authoritative source, and distinguish proposed, current and historical information.
- CLAUDE.md, when present, should contain only @AGENTS.md. Other agent integrations should
  reference the same project facts; do not import entire historical manuals at session start.
- Run `python -B .workspace/check.py` for workspace checks. It reads metadata and the Git index;
  it does not run application code, access credentials or contact external services.
- .workspace/project.json records required paths and command references. Update it when those
  contracts change. Personal machine paths and secret values do not belong in that file.
- Record completion status accurately: local, committed, pushed or deployed. A deployment needs
  evidence from the running service. Archiving a conversation does not back up work.

Resolve the `context` entries in .workspace/project.json under the shared Context root.
On Sam's Windows workspace this root is `$env:USERPROFILE\Context` (equivalently
`%USERPROFILE%\Context`). For example, `FreshTech/SuperOps` starts at
`%USERPROFILE%\Context\FreshTech\SuperOps\README.md`. Read that area's README first,
then follow only the references relevant to the task, including legacy locations it indexes.
An empty context list means no external area is mapped yet; it does not prove none exists.
Keep durable context discoveries in the project mapping and authoritative context index.
Linked worktrees use the same external Context root. Clones on another machine or cloud
environment need the approved context restored or supplied separately; private context is
not included in Git. Do not copy it into a checkout or upload it merely to resolve a link.

Missing shared Context does not block ordinary code checks. Request only the relevant approved
context when a task needs it. Bootstrap should restore tools and safe templates, not live secrets.
