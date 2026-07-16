# Quality gates

## Candidate qualification

A candidate must have a clear user problem, an authoritative source, installability or adaptability, and a license or service policy that permits the planned integration. Duplicate or substantially weaker alternatives remain discoverable evidence but are not promoted as separate formal integrations.

## Scoring dimensions

- **Usefulness:** breadth and importance of the user problem.
- **Capability uniqueness:** whether the entry adds a material ability.
- **Reliability:** runtime predictability and error quality.
- **Maintenance:** recent releases, issue handling, and upstream activity.
- **Provenance:** official identity, repository linkage, and version evidence.
- **License clarity:** machine-readable license plus direct evidence.
- **Security:** least privilege, secret handling, input boundaries, and destructive action controls.
- **Web fitness:** whether the dedicated workflow exposes the real capability rather than a cosmetic chat wrapper.

Scores support prioritization; they never replace mandatory evidence.

## Verification states

- `not-run`: no valid execution evidence exists.
- `passed`: the named test was executed against the recorded version and passed.
- `failed`: execution contradicted expected behavior.
- `blocked`: execution could not occur for a recorded external reason.
- `not-applicable`: the test category genuinely does not apply, with justification.

An entry may become `verified` only when all applicable core, scenario, failure, Web E2E, permission, and security checks have current passing evidence.

