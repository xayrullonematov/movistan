# UI/UX Phase: Implementation Bible

## Context

Phase 1 (GitHub tool grounding) is verified and working — agents genuinely call `read_file`/`list_files` against real repos and produce grounded output. The problem now is presentation: real user feedback after running the tool was that results feel like “a bunch of artifacts and texts,” overwhelming, and unclear without reading everything. The core purpose of this product is to make a hard decision *easy to consume*, not to prove how much the AI generated.

This phase has two goals:

1. **Reduce information density** across Results/Artifacts/Debate so a user can understand the outcome without reading everything.
1. **Surface the tool-call grounding visibly** — right now the strongest proof of real engineering work (agents reading real files) is invisible in the UI. That’s wasted both for users and for anyone evaluating this project.

## Before You Start

Inspect current implementations before changing anything — do not assume structure from this doc:

- `ResultsDashboard.tsx`, `ArtifactsPanel.tsx`, `ArtifactCard.tsx`, `DebateChat.tsx`, `DebateMessage.tsx`, `WorkspaceLayout.tsx`
- Confirm whether the `references` field on agent output is now populated (flagged as broken in Phase 1) — if still empty, the tool-call trace task below must source data from raw `tool_calls` in the event store instead, and that should be filed as a known gap, not silently worked around forever.

## Design Principles (apply these to every decision, not just the listed tasks)

1. **Headline first.** Every screen should answer “what do I need to know” in the first sentence, before any supporting detail.
1. **Progressive disclosure, not simultaneous disclosure.** Summary visible by default; full detail behind an explicit click. Never show both at once.
1. **Default to “what matters,” not “everything.”** Filters default to the relevant subset (e.g., accepted artifacts, top-N risks). Seeing everything is an opt-in action, not the default state.
1. **If it’s real, show it.** Anything proven to work in the backend (tool-call grounding) needs a visible UI representation — invisible correctness has no user or demo value.
1. **No dead UI.** Remove unused components rather than leaving them as confusing cruft for anyone reading the codebase.

## Tasks, in priority order

### 1. Headline/TL;DR on Results screen

- Auto-generate and display a one-line recommendation at the very top of `ResultsDashboard.tsx`, above the consensus gauge and all lists — e.g. “Recommendation: [X] — confidence Y%.”
- This is the single highest-leverage fix for the “I can’t understand it without reading everything” complaint.

### 2. Tool-call trace visibility (new)

- New component, e.g. `ToolCallTrace.tsx`: a table of agent → files read → call count → cap-hit status, modeled on the data already proven out in testing (security: 9 files, performance: webhook route, etc.).
- Ideally render this **live during the Proposal stage** (“Security agent is reading `middleware.ts`…”) for the strongest demo moment — check whether stage-progress events already carry enough data for this before building new plumbing.
- After the round completes, keep a static summary version of this table accessible from the Results or Debate tab.
- If the `references` field is still unpopulated, source file paths from the raw `tool_calls` arguments in the event store as a fallback, and note this as tech debt to fix at the source.

### 3. Artifacts tab: change the defaults

- Default status filter to “Accepted” (not “All status”) — this is a one-line default change in `WorkspaceLayout.tsx`/`ArtifactsPanel.tsx`, not new functionality.
- Sort by confidence/severity descending by default.
- Keep “show all” as an explicit, clearly-labeled toggle — don’t remove the ability to see everything, just stop leading with it.

### 4. Collapse debate messages by default

- In `DebateMessage.tsx`, render each agent turn collapsed to: agent name + one-line summary by default.
- Click to expand full detail (objections, risks, recommendations, conceded/maintained points).
- Reuse the expand/collapse interaction pattern already built in `ArtifactCard.tsx` — don’t invent a new pattern.

### 5. Cap Key Decisions / Risk Register to top 3–5

- In `ResultsDashboard.tsx`, show the top 3–5 items by confidence/severity, with a “show all (N)” expander for the rest.
- Applies to both the Key Decisions list and the Risk Register table.

### 6. Cleanup

- Delete unused components confirmed dead in Phase 1 review: `EngineeringOutcomesPanel.tsx`, `DecisionLog.tsx`, `SharedWorkspace.tsx` — confirm via grep that nothing imports them before deleting.
- Fix the icon placeholders in `AgentDiagram.tsx` (currently plain geometric shapes with a “placeholder” comment) — use real icons consistent with the existing agent color tokens.

## Constraints — do not violate these

- **Reuse existing design tokens.** All colors/spacing already live as CSS variables in `globals.css`. No new ad hoc hex values or spacing.
- **Reuse existing interaction patterns.** The expand/collapse behavior in `ArtifactCard.tsx` is the canonical pattern — apply it to debate messages rather than building a second pattern.
- **Preserve existing accessibility work.** Match the `aria-label`/`aria-expanded`/keyboard-handler conventions already used in `AgentArena.tsx`. Don’t ship new interactive elements without them.
- **Don’t restructure navigation.** The Debate/Artifacts/Results tab structure stays as-is — these changes reduce density *within* each tab, they don’t change how users move between them.
- **Respect `prefers-reduced-motion`**, already handled globally — any new animation (e.g., a “thinking/reading file” pulse for the live trace) must honor it.

## Acceptance criteria

- [ ] Results screen shows a one-line headline before any list or chart
- [ ] Tool-call trace is visible somewhere in the UI, sourced from real data (not hardcoded)
- [ ] Artifacts tab loads with “Accepted” + confidence-sorted by default; “show all” toggle confirmed working
- [ ] Debate messages load collapsed; expand/collapse confirmed working and keyboard-accessible
- [ ] Key Decisions and Risk Register both show top 3–5 with a working “show all” expander
- [ ] `EngineeringOutcomesPanel`, `DecisionLog`, `SharedWorkspace` deleted, build still passes
- [ ] `AgentDiagram.tsx` icons are real, not placeholders
- [ ] No regressions in existing component tests; new tests added for any new collapse/filter logic

## Out of scope for this pass

- Mobile-responsive redesign (project is explicitly desktop-first per design.md)
- Visual theme/color overhaul (current design system is solid — this phase is about information architecture, not aesthetics)
- Changes to the underlying data model or API contracts