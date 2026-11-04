# Gnoesis Agentic Control Plane

Rebrand of T3 Code (`pingdotgg/t3code`, v0.1.6) used as the control plane surface, with the dsh
Superagent stack and REA behind it.

## What runs where

| Piece | Where | Entry |
| --- | --- | --- |
| Gnoesis UI (rebranded T3) | `/tmp/t3code` (source) → `/root/.t3/runtime/versions/0.1.6/client` (served) | `t3 serve --host 127.0.0.1 --port 3090 --auto-bootstrap-project-from-cwd /home/workspace` |
| Superagent pane | dsh profile `superagent` (port 3084, proxied under `/superagent` on 3080) | `Projects/dsh-superagent-prototype` |
| Harness web UI | Zo service `deepseek-harness`, port 3080 | `Projects/deepseek-harness/scripts/zo-web.mjs` |
| REA tools | MCP stdio inside the `superagent` profile | `rea-test/node_modules/.bin/rea --mcp` |
| T3 ACP provider | dsh profile `acp` | `dsh --profile acp` (T3: Settings → Providers → Local ACP command) |

## Rebrand

Source edits in `/tmp/t3code` (rebuild with `bun run --filter @t3tools/web build`):

- `apps/web/src/branding.ts` — `APP_BASE_NAME` default → `Gnoesis Agentic Control Plane`.
- Same file — the unset-env fallback stage label was `Beta` (which appends `(Beta)`), now `Latest`, so the display name renders bare.
- `apps/web/src/components/onboarding/WelcomeWizard.tsx` — wizard title and identity use `APP_BASE_NAME` instead of hardcoded `T3 Code` + wordmark.
- `apps/web/index.html` — `<title>`, splash aria-label and boot-shell label.

Result: window title, app display name and onboarding all say **Gnoesis Agentic Control Plane** with no stage suffix.

## Not rebranded

`T3 Code` still appears 167 times in the built bundles — help text, error strings, "Sent by T3 Code"
message attribution, and the T3 Connect / phone-companion product. Those are upstream product
copy tied to t3.codes services, deliberately left alone. Fork them only if the surface stops using
those services.

## Caveats

- The 0.1.6 runtime symlink serves `client/` from the installed version dir. A `t3 update` replaces
  that directory and reverts the branding; re-copy the rebuilt `dist` afterwards.
- `/tmp/t3code` is scratch, not durable. It is a full source checkout plus `dist` output; re-clone
  and re-apply the three edits if `/tmp` is cleared.
