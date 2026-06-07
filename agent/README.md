# Agent Assembly — Azure Governance Baseline Advisor

Assembles the **"Morgan Cole"** senior Azure governance architect agent on the
Napster Omniagent platform (`https://companion-api.napster.com`).

The script creates the companion persona, uploads the governance knowledge base
document, registers the `check_policy_compliance` tool, creates the FAQ
collection, and assembles the agent — wiring the tool, knowledge base, and FAQ
collection together with voice, a video avatar, persistent memory, and a fixed
model temperature of `0.4`.

## Layout

- `src/types.ts` — request payload and identifier types.
- `src/system-prompt.ts` — the system prompt enforcing tool-before-claims,
  severity-ordered/category-grouped presentation, KB grounding, no fabrication,
  and the top-5 closing summary.
- `src/config.ts` — **pure, unit-testable** payload builders (companion, KB,
  tool, FAQ, agent).
- `src/napster-client.ts` — authenticated HTTP client for the Napster API.
- `src/assemble.ts` — entry point: reads env, loads content, sequences the API
  calls.

## Configuration

Copy `.env.example` and set the values:

| Variable | Purpose |
| --- | --- |
| `NAPSTER_API_KEY` | Napster API key (`X-Api-Key`). |
| `POLICY_FUNCTION_ENDPOINT` | Base Policy Function URL (no `?code=`). |
| `POLICY_FUNCTION_KEY` | Function authorization key, embedded as `?code=`. |
| `NAPSTER_BASE_URL` | Optional API base URL override. |
| `KNOWLEDGE_DIR` | Optional content directory (defaults to `../knowledge`). |

Secrets are read only from the environment — never hardcode them.

## Usage

```bash
npm install
npm run typecheck   # type-check without emitting
npm run assemble    # build + run the assembly (prints the AGENT_ID)
npm test            # config payload tests (task 11.2)
```

The content files consumed at assembly time are
`../knowledge/governance-baseline-framework.md` and `../knowledge/faq.json`.
