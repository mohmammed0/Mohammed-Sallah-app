# Sallah multi-tool engineering handoff

هذه الحزمة هي بوابة التسليم المرجعية بعد انتهاء أعمال Codex. العربية هي لغة المنتج
الأولى، وتُكتب العقود التقنية الدقيقة بالإنجليزية لتفادي الغموض بين الأدوات.

دُمج [PR #36](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/36) في `main`، وأُنشئ
وسم `sallah-multitool-handoff-v1` لنقطة التسليم المتحقق منها. الوسم ثابت؛ يبدأ العمل الجديد
من رأس `main` الحالي، كما يوضح [دليل ما قبل الإطلاق](../release/PRELAUNCH.md).

This directory is the canonical handoff gateway for Figma, Claude Code, Canva,
and delivery tooling. Every tool starts from a clean checkout of `main` and
resolves the exact checkout with `git rev-parse HEAD`. [PR #36](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/36)
was merged into `main`. The immutable handoff tag `sallah-multitool-handoff-v1` exists at
`2cf253bb44d417a02fd483395a862ff66bb4b053`; it preserves that verified checkpoint and does not move
with later `main` changes. The [prelaunch guide](../release/PRELAUNCH.md) records its CI and tag identity.
A tracked file cannot safely embed the hash of the commit that contains itself; resolve current `main` afresh.

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
- [Code and GitHub prelaunch guide](../release/PRELAUNCH.md)
- [Validation evidence](VALIDATION_EVIDENCE.md)
- [Git ancestry and PR chain](GIT_ANCESTRY_AND_PR_CHAIN.md)
- [External release gates](../release/EXTERNAL_RELEASE_GATES.md)
- [Machine-readable manifest](handoff-manifest.json)

Engineering handoff readiness is not Production readiness, store readiness, or
physical-device validation. Those states remain separately labelled.
