# Superagent — agent roster and operating notes

This repository is the fork of `deepseek-ai/dsh-superagent-prototype` that runs the Gnoesis factory's agents. It is the orchestration layer; the harness itself lives in `Projects/deepseek-harness`, and the control-plane UI is the rebranded T3 Code described in `GNOESIS.md`.

Upstream is `deepseek-ai` at commit `8c32a9d` (`feat: add the dsh-superagent research prototype`). Keep upstream history intact so future upstream merges stay cheap: do not rewrite published commits, and add local work as normal commits on top.

## Agents in this repo

Each agent is a bundle composed in `cordis.patch.yml` plus a preset under `src/`. The rostered agents:

| Agent | Role | Entry point |
| --- | --- | --- |
| `superagent` | Orchestrator. Takes repository work items, decomposes them, delegates, and answers in the originating conversation. | profile `/root/.dsh/profiles/superagent` |
| `rea` | Reverse-engineering specialist. Mounted as the `rea-mcp` MCP client (207 tools) rooted at `/home/workspace/rea-test`. | `harness.patch.yml` in the REA workspace |
| `acp` | Automation-only ACP surface so the Gnoesis control plane (T3) and other ACP clients can drive the harness. | profile `/root/.dsh/profiles/acp` |

## Live wiring on this Zo

`Projects/deepseek-harness/scripts/zo-web.mjs` supervises the `web` profile at `/` and the `superagent` profile at `/superagent/` behind one private Zo service (`deepseek-harness`, port 3080). The adapter mints its own dsh session, so a browser needs no dsh token; `/login` and `/superagent/login` re-establish it.

Model routing comes from `llm-pi-ai`. The working providers are `ollama-cloud` and `modal-llm`; `modal-llm` fronts the Modal endpoint in `Projects/modal-llm`, whose `dragonfly:*` routes use the `dragonflyaiagent` workspace proxy token (`MODAL1_PROXY_TOKEN_ID` / `_SECRET`). The panel's default model is `DeepSeek V4.1 Flash (Dragonfly)`.

OpenRouter is configured in the profile but has no key, so those routes 401 until a key is saved.

## Still pending

- GitHub Source repository for the superagent profile.
- Agent GitHub account (`/root/.local/bin/gh-agent`, not signed in).
- Allowed sender list.
