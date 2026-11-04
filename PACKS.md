# SME packs

An SME pack is the only industry-specific artifact in a Gnoesis deployment. The control plane is identical across industries; the pack supplies the specialist agents, the skills they run, the references they read, and the eval set used to accept or reject changes.

A deployment ships with exactly one pack mounted. Packs live outside the control plane so they can be versioned, replaced, and evaluated independently.

## Layout

```
packs/<pack-id>/
  pack.yaml           # id, version, hash, mounted agents, model tiers
  agents/*.md         # one file per specialist agent: mandate, scope, tools
  skills/<name>/      # SKILL.md + scripts, deterministic procedures
  references/         # point-in-time domain data the agents may read
  evals/              # held-out cases with expected outcomes
  PLAYBOOK.md         # what the RSI loop has learned about this pack
```

## Contract

- **`pack.yaml`** declares the id, the semver version, the mounted agent roster, the model tier per agent, and the write threshold above which a platform action needs human approval.
- **Agents** are named teammates with a mandate and a workspace scope. Names are permanent within a pack version.
- **Skills** are the procedures the SME actually follows. Each is a `SKILL.md` plus scripts; the skill is what makes a generic builder agent competent in the industry.
- **References** are read-only domain data. Dated, so the eval can be run point-in-time.
- **Evals** are held out from day one. Every promotion decision counts every trial run against them.

## Promotion

A challenger pack replaces the incumbent only when it beats it on the pack's eval set out of sample, after the nightly RSI loop has held it for one full cycle. Promotion is a human decision recorded in the pack's `PLAYBOOK.md`; the RSI loop may recommend, never deploy.

## Shipping a pack

1. Mount the platform adapter: read platform event, write platform result.
2. Author `pack.yaml`, agents, skills, references, evals.
3. Baseline the stock roster on the eval set; store the baseline hash.
4. Pilot the build loop with RSI off for two weeks.
5. Enable the RSI loop; first challenger promotion is expected in week three or later.

See `docs/009-composable-sme-plan.md` for the full plan and the two loops.
