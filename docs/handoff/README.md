# Sallah multi-tool engineering handoff

هذه الحزمة هي بوابة التسليم المرجعية بعد انتهاء أعمال Codex. العربية هي لغة المنتج
الأولى، وتُكتب العقود التقنية الدقيقة بالإنجليزية لتفادي الغموض بين الأدوات.

This directory is the canonical handoff gateway for Figma, Claude Code, Canva,
and delivery tooling. Every tool starts from a clean checkout of `main` and
resolves the exact checkout with `git rev-parse HEAD`. The immutable integrated
baseline is tagged `sallah-multitool-handoff-v1`; a tracked file cannot safely
embed the hash of the commit that contains itself.

## Start here

1. [Tools must start from](TOOLS_MUST_START_FROM.md)
2. [Current state](CURRENT_STATE.md)
3. [Repository map](REPOSITORY_MAP.md)
4. [Product scope](PRODUCT_SCOPE.md)
5. [Architecture summary](ARCHITECTURE_SUMMARY.md)
6. [Tool ownership](TOOL_OWNERSHIP_MATRIX.md)
7. [UI allowlist](UI_ALLOWLIST.md) and [denylist](UI_DENYLIST.md)
8. Tool-specific brief: [Claude](CLAUDE_CODE_HANDOFF.md),
   [Figma](FIGMA_HANDOFF.md), [Canva](CANVA_HANDOFF.md), or
   [Notion/Linear](NOTION_LINEAR_HANDOFF.md)

## Evidence

- [Starting baseline](CODEX_STARTING_BASELINE.md)
- [Validation evidence](VALIDATION_EVIDENCE.md)
- [Git ancestry and PR chain](GIT_ANCESTRY_AND_PR_CHAIN.md)
- [External release gates](../release/EXTERNAL_RELEASE_GATES.md)
- [Machine-readable manifest](handoff-manifest.json)

Engineering handoff readiness is not Production readiness, store readiness, or
physical-device validation. Those states remain separately labelled.
