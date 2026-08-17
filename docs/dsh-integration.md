# DSH integration

This page explains how the framework's profiles work and how the tool bridge
functions, plus troubleshooting.

## Profiles

`bin/setup.sh` copies `profiles/my-agent-headless` and
`profiles/my-agent-web` into `$DSH_HOME/profiles/` (default
`~/.dsh/profiles`), substituting `__REPO__` in the patch with the repo's
absolute path, and symlinks `examples/node_modules` to
`$DSH_HOME/profiles/node_modules` so plugins resolve `@deepseek-ai/*`.

| Profile | Bundles | Entry |
|---|---|---|
| `my-agent-headless` | `dsh-base` + `dsh-headless` | `dsh --profile my-agent-headless "task"` |
| `my-agent-web` | `dsh-base` + `dsh-web-app` | `dsh --profile my-agent-web` (web GUI on :3080) |

Validation (no boot): `pnpm dsh --profile my-agent-headless --dump-config`
from the DSH checkout.

## The tool bridge

`registerFrameworkTools(ctx, specs)` converts each framework tool into a DSH
`ToolDefinition` and registers it on `ctx.tools`:

1. **Schema** — `toDshParameterSpec` converts the TypeBox object schema into
   a plain JSON Schema (strips TypeBox keywords). DSH's registry validates the
   model's arguments against it.
2. **Execution** — `execute(args)` calls your `run(args)` and stringifies
   the result as the canonical output; the model sees that text.
3. **Dependency** — the plugin must declare `export const inject = ['tools']`
   (or wrap registration in `ctx.inject(['tools'], ...)`), otherwise Cordis
   rejects `ctx.tools` access with "cannot get property \"tools\" without inject".

## Why type-only harness imports

The bridge uses structural types (see `ToolRegistrant`) so the framework
package typechecks without depending on unreleased `@deepseek-ai/*` versions.
Runtime resolution happens inside the DSH process, where the profile's module
fallback provides the real packages.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `cannot get property "tools" without inject` | Add `export const inject = ['tools']` to the plugin |
| `Invalid schema for function 'x': ... type: null` | Register a full JSON Schema (the bridge does this) — don't pass a property-map as `parameters` |
| `ERR_MODULE_NOT_FOUND` for `@deepseek-ai/*` | Re-run `bin/setup.sh` (fixes the `examples/node_modules` symlink) |
| Patch changes not applied | Restart the profile/server — patches apply at boot |
| `--dump-config` shows a row without your config | Later layers override by id — check `$DSH_HOME/cordis.patch.yml` and `--patch` overlays |
| Model not found for provider | Check the env var is set and the route name is spelled as in the patch |

## Advanced: the harness agent loop

The profiles reuse DSH's own loop (sessions, subagents, goals, plan mode,
sandbox, compaction). Your plugin adds tools and context on top. For deeper
integration (custom entry points, JSON-RPC/ACP servers), see the DSH docs:
`docs/user/develop/basic/index.md`, `docs/cordis-primer.md`, and the
`packages/examples/agent-spine-demo` bundle.
