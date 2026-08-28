# Sallah multi-tool engineering handoff

هذه الحزمة هي بوابة التسليم المرجعية بعد انتهاء أعمال Codex. العربية هي لغة المنتج
الأولى، وتُكتب العقود التقنية الدقيقة بالإنجليزية لتفادي الغموض بين الأدوات.

This directory is the canonical handoff gateway for Figma, Claude Code, Canva,
and delivery tooling. Resolve the exact checkout with `git rev-parse HEAD`; a
tracked file cannot safely embed the hash of the commit that contains itself.

## Start here

1. [Current state](CURRENT_STATE.md)
2. [Repository map](REPOSITORY_MAP.md)
3. [Product scope](PRODUCT_SCOPE.md)
4. [Architecture summary](ARCHITECTURE_SUMMARY.md)
5. [Tool ownership](TOOL_OWNERSHIP_MATRIX.md)
6. [UI allowlist](UI_ALLOWLIST.md) and [denylist](UI_DENYLIST.md)
7. Tool-specific brief: [Claude](CLAUDE_CODE_HANDOFF.md),
   [Figma](FIGMA_HANDOFF.md), [Canva](CANVA_HANDOFF.md), or
   [Notion/Linear](NOTION_LINEAR_HANDOFF.md)

## Evidence

- [Starting baseline](CODEX_STARTING_BASELINE.md)
- [Validation evidence](VALIDATION_EVIDENCE.md)
- [Git ancestry and PR chain](GIT_ANCESTRY_AND_PR_CHAIN.md)
- [External gates](EXTERNAL_GATES.md)
- [Machine-readable manifest](handoff-manifest.json)

Engineering handoff readiness is not Production readiness, store readiness, or
physical-device validation. Those states remain separately labelled.
