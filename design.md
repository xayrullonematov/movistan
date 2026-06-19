# UI/UX Design Overhaul — AI Engineering Room

> **Goal:** Transform the current developer-facing UI into an instantly understandable, visually engaging application that any user can operate on first visit — optimized for hackathon demo appeal and the "AI talks to AI" narrative.

## Tech Stack & Constraints

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS 4 (already configured)
- **Data fetching:** SWR (already in use)
- **Animations:** Use CSS animations/transitions + Tailwind `animate-*` utilities. Install `framer-motion` for complex orchestrated animations (agent communication, stage transitions).
- **Icons:** Install `lucide-react` for consistent iconography.
- **No component library** — all custom components with Tailwind.
- **Dark theme only** — keep the existing dark palette but refine it with better contrast and accent colors per agent.
- **Desktop-first** — judges/demo viewers use desktop. Mobile is not a priority.

---

## Design System Foundation

### Color Palette

```
Background:       #030712 (gray-950)
Surface:          #111827 (gray-900)
Surface elevated: #1f2937 (gray-800)
Border:           #374151 (gray-700)
Text primary:     #f9fafb (gray-50)
Text secondary:   #9ca3af (gray-400)
Text muted:       #6b7280 (gray-500)
```

### Agent Colors (each agent gets a unique accent)

```
Senior Engineer:      #3b82f6 (blue-500)      — "Architect"
Security Engineer:    #ef4444 (red-500)        — "Guardian"  
Performance Engineer: #f59e0b (amber-500)      — "Optimizer"
Product Engineer:     #8b5cf6 (violet-500)     — "Advocate"
```

### Artifact Type Colors

```
Decision:       #22c55e (green-500)
Risk:           #ef4444 (red-500)
Assumption:     #f59e0b (amber-500)
Tradeoff:       #8b5cf6 (violet-500)
Open Question:  #06b6d4 (cyan-500)
Recommendation: #3b82f6 (blue-500)
```

### Typography

```
Headings: Inter, font-weight 600-700
Body:     Inter, font-weight 400
Mono:     GeistMono (for code/technical content)
```

### Spacing & Radius

```
Card radius:    12px (rounded-xl)
Button radius:  8px (rounded-lg)
Badge radius:   6px (rounded-md)
Spacing unit:   4px base, use multiples (8, 12, 16, 24, 32, 48)
```

---

## Page 1: Landing / Home Page (`src/app/page.tsx`)

### Current State
A split layout with "New Session" form on the left and "Sessions" list on the right. No explanation of what the app does. A first-time visitor has no idea what "AI Engineering Room" means.

### Redesign Prompt

**Implement a landing page with these sections in order:**

1. **Hero Section** (full viewport height minus nav)
   - Large headline: "4 AI Engineers. One Engineering Problem. Real Debate."
   - Subtitle: "Watch autonomous AI agents with competing objectives debate your engineering decisions — producing structured artifacts, surfacing risks, and reaching consensus."
   - A **visual diagram** showing 4 agent nodes (colored circles with icons) arranged in a diamond pattern with animated dashed lines between them showing communication flow. Use SVG with CSS animations for the pulsing connection lines.
   - One primary CTA button: "Start a Debate →" (scrolls to form or opens modal)
   - One secondary link: "Watch how it works" (scrolls to explainer)

2. **How It Works** (3-step horizontal flow)
   - Step 1: "Describe Your Problem" — icon of a text input, brief description
   - Step 2: "Agents Debate" — icon showing 4 nodes with arrows, "Four AI engineers with different priorities analyze, critique, and refine solutions"
   - Step 3: "Get Artifacts" — icon of documents, "Receive structured decisions, identified risks, tradeoffs, and recommendations"
   - Each step connected by a horizontal line/arrow on desktop

3. **Agent Showcase** (4 cards in a row)
   - Each card shows:
     - Agent avatar (colored circle with role icon)
     - Agent name: "The Architect", "The Guardian", "The Optimizer", "The Advocate"
     - Role: "Senior Engineer", "Security Engineer", "Performance Engineer", "Product Engineer"
     - Objective (one line): e.g., "Maximize system maintainability and architectural coherence"
   - Cards have the agent's accent color as a subtle top border or glow

4. **Start Session Section** (the form, redesigned)
   - Full-width centered container (max-w-2xl)
   - The problem description textarea should be large and inviting (h-40+)
   - Placeholder text should be an actual example: "Should we migrate our monolith to microservices? We have 50 engineers, 3M daily requests, and need to ship faster. Current deploy takes 45 minutes..."
   - Token budget field hidden behind "Advanced options" toggle
   - Constraints as optional chips below
   - Big "Start Debate" button with gradient (blue to violet)

5. **Recent Sessions** (below the form, only if sessions exist)
   - Show as a compact list/table, not cards
   - Each row: problem excerpt, status badge, round count, time ago
   - "View all sessions" link if more than 5

### Specific Implementation Details

- The hero agent diagram should be an SVG component (`AgentDiagram.tsx`) that shows:
  - 4 circles at cardinal points (top=senior/blue, right=security/red, bottom=performance/amber, left=product/violet)
  - Animated dashed lines between critique pairs (senior↔performance, security↔product) with CSS `stroke-dashoffset` animation
  - Labels below each circle
  - On hover, each node glows brighter
- Use `framer-motion` for scroll-triggered fade-in animations on each section
- The CTA button should have a subtle gradient animation (shifting blue→violet)

---

## Page 2: Session Workspace (`src/app/sessions/[sessionId]/page.tsx`)

### Current State
A 3-column grid (primary/agents/timeline) with raw data display. Functional but overwhelming — too much information with no visual hierarchy or storytelling.

### Redesign Prompt

**Completely rebuild the workspace layout with these principles:**
- The workspace should feel like a **war room** or **live panel discussion**, not a database viewer
- Visual hierarchy: what's happening NOW should be the loudest element
- Agent activity should be visually represented, not just text

#### Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  Header: breadcrumb + session title + status + actions  │
├─────────────────────────────────────────────────────────┤
│  Stage Progress Bar (horizontal, full width)            │
├──────────────────────┬──────────────────────────────────┤
│                      │                                  │
│   Agent Arena        │    Main Content                  │
│   (left, 35%)       │    (right, 65%)                  │
│                      │                                  │
│   - 4 agent cards    │    Tab navigation:               │
│   - Visual comms     │    [Debate] [Artifacts] [Results]│
│   - Live activity    │                                  │
│                      │    Content based on active tab   │
│                      │                                  │
├──────────────────────┴──────────────────────────────────┤
│  Footer: action buttons + token budget bar              │
└─────────────────────────────────────────────────────────┘
```

#### Header Bar

- Left: "← All Sessions" breadcrumb link + Session title (truncated problem description, editable feel)
- Center: `SessionStatusBadge` (redesigned — larger, with icon: spinning for active, checkmark for completed, pause for paused)
- Right: Round counter "Round 2/∞" + Token budget mini progress bar + Export button + End Session button (danger styled, confirmation modal)

#### Stage Progress Bar (new component: `StageProgressBar.tsx`)

- Full-width horizontal bar below the header
- 4 segments: Proposal → Critique → Revision → Consensus
- Each segment shows: stage name, icon, state (complete/active/pending)
- The active segment pulses with the current agent's color
- Completed segments show a checkmark and fill with green
- Between segments, show an animated arrow/chevron
- When idle (awaiting intervention), show a yellow pulsing "Your Turn" indicator

#### Agent Arena (left panel)

**This is the "wow" visual for the demo.** It replaces the current boring collapsible cards.

Top half — **Agent Communication Visualization** (`AgentArena.tsx`):
- Show 4 agent avatars arranged in a diamond/square pattern
- Each avatar: colored circle (40-50px) with agent icon inside + name label below
- When a round is active:
  - The currently-speaking agent's circle scales up slightly and pulses
  - Animated particle lines flow FROM the proposer TO the critic (during critique stage)
  - Lines use the source agent's color
  - A small speech bubble appears next to the active agent showing a 1-line summary of what they're saying
- When idle:
  - Static positions, subtle idle breathing animation
  - Connection lines shown as faded dashed lines

Bottom half — **Agent Detail Cards** (below the visualization):
- 4 compact horizontal cards stacked vertically
- Each card shows:
  - Left: colored dot + agent name
  - Center: current stance badge (agree/disagree/concede) + confidence meter (thin horizontal bar, 0-100%)
  - Right: status indicator ("Thinking..." with spinner, "Done ✓", or idle dash)
- Clicking a card expands it to show the agent's current position text
- Card border uses the agent's accent color (subtle, left-border style)

#### Main Content Area (right panel) — Tabbed Interface

**Tab 1: Debate (default when round is active)**

- Shows the debate as a **chat-style conversation timeline**, not a raw event log
- Each message bubble:
  - Agent avatar (small colored circle) + agent name + timestamp on the left
  - Message content as formatted card on the right
  - For proposals: show as a structured card with "Proposal" header, key points as bullets
  - For critiques: show with red/orange left border, "Critique of [agent]" header, objections listed with severity badges
  - For revisions: show with green left border, stance badge prominently displayed, revised position
  - For consensus: show as a special "gold" highlighted card with agreements/disagreements summary
- Messages should appear with a slide-in animation when they arrive
- Group messages by stage with a stage separator bar between groups
- Auto-scroll to bottom when new messages arrive

**Tab 2: Artifacts (default when session is complete)**

- Grid of artifact cards (2 columns)
- Each card redesigned:
  - Full-color left border using the artifact type color
  - Type icon (large, top-left) + type label badge
  - Title (prominent, font-medium)
  - Content preview (2 lines, truncated)
  - Status badge (draft=yellow, accepted=green, rejected=red) with ability to click to change
  - Contributors shown as colored dots (agent colors)
  - Version indicator if > 1
- Filter bar at top: filter by type (decision/risk/etc.) and status (all/draft/accepted/rejected)
- Click card → slide-in detail panel from right (or modal) showing full content, history, provenance

**Tab 3: Results (available after round 1+)**

- Summary dashboard with:
  - **Consensus meter**: visual gauge showing % agreement vs disagreement
  - **Key Decisions** section: accepted decisions as prominent green cards
  - **Risk Register**: risks as a table with severity color-coding
  - **Open Questions**: listed with agent attribution
  - **Export button**: prominent, generates markdown summary

#### Footer

- Left: Primary action button "Start Next Round" (blue gradient, large) + "Add Constraint" (secondary) + "End Session" (ghost/danger)
- Center: Round counter with mini circles (filled for completed rounds, outlined for future)
- Right: Token budget — horizontal progress bar with label "4,231 / 100,000 tokens used" + estimated cost

#### Empty State (no rounds yet)

When a session is freshly created and no round has started:
- Show the Agent Arena in idle state (agents positioned but no activity)
- Main content area shows a **Getting Started** card:
  - "Your AI engineering team is ready"
  - Brief reminder of the problem
  - "Click 'Start Round' to begin the structured debate. Each round goes through 4 stages: Proposal → Critique → Revision → Consensus"
  - Big "Start First Round" button with an arrow icon
- This should feel inviting, not empty

#### Active Round State

When a round is running:
- Header shows a subtle animated gradient border (blue→violet cycling)
- Stage progress bar is active and animating
- Agent Arena shows live activity
- Debate tab auto-selected, messages streaming in
- Footer "Start Round" button disabled with "Round in progress..." text
- A subtle pulsing dot in the browser tab title: "● AI Engineering Room"

#### Awaiting Intervention State

When the round completes and awaits user input:
- Stage progress bar shows all 4 stages complete, then a 5th "Your Turn" segment highlighted in yellow
- A prominent notification banner slides down below the header: "Round complete! Review the artifacts and start the next round, or add constraints."
- The intervention form (constraint input) appears in the main content area as a highlighted card
- Footer "Start Next Round" button glows/pulses to draw attention

---

## Component Specifications

### `AgentAvatar.tsx` (new)

```tsx
interface AgentAvatarProps {
  agent: "senior-engineer" | "security-engineer" | "performance-engineer" | "product-engineer";
  size?: "sm" | "md" | "lg";  // 32px, 48px, 64px
  isActive?: boolean;         // adds pulse animation
  isSpeaking?: boolean;       // adds glow + scale
}
```

- Renders a colored circle with an icon inside (use lucide icons: Code2, Shield, Zap, Users)
- Colors from the agent color palette above
- Active state: ring animation around the circle
- Speaking state: 1.1x scale + box-shadow glow in agent color

### `AgentArena.tsx` (new)

```tsx
interface AgentArenaProps {
  agents: AgentState[];
  currentStage: RoundStage | null;
  activeAgentId?: string;
}
```

- SVG-based layout with 4 positioned agents
- Draws animated connection lines between critique pairs
- Shows activity indicators per agent
- Responsive within its container (use viewBox)

### `StageProgressBar.tsx` (replaces `RoundProgressIndicator.tsx`)

```tsx
interface StageProgressBarProps {
  currentStage: RoundStage | null;
  completedStages: RoundStage[];
}
```

- Horizontal bar with 4 equally-sized segments + optional 5th "intervention" segment
- Each segment: icon + label + state coloring
- Active segment has animated fill (gradient sliding left to right)
- Completed segments: solid green fill with checkmark
- Pending segments: gray outlined

### `DebateMessage.tsx` (new)

```tsx
interface DebateMessageProps {
  type: "proposal" | "critique" | "revision" | "consensus";
  agent: AgentType;
  content: string | object;  // structured content from schemas
  timestamp: string;
  targetAgent?: AgentType;   // for critiques: who is being critiqued
}
```

- Renders as a chat bubble with:
  - Agent avatar + name on left
  - Content card on right
  - Left border colored by message type (blue=proposal, red=critique, green=revision, gold=consensus)
  - Structured content rendered appropriately (bullets for proposals, objection cards for critiques)

### `ArtifactCard.tsx` (redesign existing)

- Add full-color left border (4px) using artifact type color
- Larger type icon
- Improve information hierarchy: title > status > content > meta
- Add hover lift effect (translate-y -1px + shadow)
- Add status change dropdown on hover (draft→accepted/rejected)

### `TokenBudgetBar.tsx` (new)

```tsx
interface TokenBudgetBarProps {
  used: number;
  total: number;
  estimatedCost: number;
}
```

- Thin horizontal progress bar
- Color shifts: green (0-50%), yellow (50-80%), red (80-100%)
- Label below: "X / Y tokens • $0.XX"

### `NotificationBanner.tsx` (new)

```tsx
interface NotificationBannerProps {
  type: "info" | "success" | "warning" | "action";
  message: string;
  action?: { label: string; onClick: () => void };
  dismissible?: boolean;
}
```

- Slides down from top with framer-motion
- Color-coded by type
- Optional action button on the right
- Dismiss X button if dismissible

---

## Animations & Transitions

### Install framer-motion

```bash
npm install framer-motion
```

### Key Animations

1. **Page transitions**: Fade + slight Y translate on route change (wrap in `AnimatePresence`)
2. **Agent speaking**: Scale up to 1.1 + glow shadow, 300ms ease-out
3. **Connection lines**: SVG stroke-dasharray animation, cycling 0→100 over 2s
4. **Message appear**: Slide in from left + fade, stagger 50ms per message
5. **Stage completion**: Segment fills left-to-right over 500ms, checkmark pops in with spring
6. **Artifact creation**: Card scales from 0.8→1 + fade in, 200ms
7. **Notification banner**: Slide down from -100% Y, 300ms spring
8. **Button hover**: Subtle lift (translateY -1px) + shadow increase
9. **Idle breathing**: Agents gently scale 1→1.02→1 over 3s, infinite, alternating

### CSS Keyframes to add to `globals.css`

```css
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 currentColor; }
  50% { box-shadow: 0 0 20px 4px currentColor; }
}

@keyframes flow-dash {
  to { stroke-dashoffset: -20; }
}

@keyframes gradient-shift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}
```

---

## Interaction Flow (User Journey)

### First Visit
1. User lands on hero → immediately understands "4 AI agents debate engineering problems"
2. Scrolls to "How it Works" → understands the 3-step process
3. Sees agent cards → understands each has different priorities
4. Reaches the form → types their problem
5. Clicks "Start Debate" → session created, redirected to workspace

### During a Round
1. Workspace shows Agent Arena with live activity
2. Debate tab shows messages appearing in real-time
3. Stage progress bar advances through stages
4. User watches agents propose, critique, revise, and reach consensus
5. Artifacts appear in the Artifacts tab as they're created

### Between Rounds
1. "Your Turn" notification appears
2. User reviews artifacts (accepts/rejects decisions)
3. Optionally adds constraints
4. Clicks "Start Next Round" for deeper exploration

### Viewing Results
1. Results tab shows a clean summary dashboard
2. All accepted decisions, identified risks, open questions
3. Export button produces a clean markdown document

---

## File Changes Summary

### New Files to Create
- `src/components/landing/HeroSection.tsx`
- `src/components/landing/HowItWorks.tsx`
- `src/components/landing/AgentShowcase.tsx`
- `src/components/landing/AgentDiagram.tsx` (SVG animation)
- `src/components/workspace/AgentArena.tsx`
- `src/components/workspace/AgentAvatar.tsx`
- `src/components/workspace/StageProgressBar.tsx`
- `src/components/workspace/DebateMessage.tsx`
- `src/components/workspace/DebateChat.tsx` (chat-style timeline)
- `src/components/workspace/TokenBudgetBar.tsx`
- `src/components/workspace/WorkspaceTabs.tsx`
- `src/components/workspace/ResultsDashboard.tsx`
- `src/components/ui/NotificationBanner.tsx`

### Files to Redesign (rewrite)
- `src/app/page.tsx` — landing page with hero, how-it-works, form
- `src/components/workspace/WorkspaceLayout.tsx` — new 2-column layout with tabs
- `src/components/workspace/AgentPanel.tsx` → replaced by AgentArena
- `src/components/workspace/DebateTimeline.tsx` → replaced by DebateChat
- `src/components/workspace/RoundProgressIndicator.tsx` → replaced by StageProgressBar
- `src/components/workspace/ArtifactCard.tsx` — visual upgrade
- `src/components/workspace/ConsensusDashboard.tsx` — integrate into ResultsDashboard
- `src/components/session/NewSessionForm.tsx` — larger, more inviting, example placeholders
- `src/components/session/SessionList.tsx` — compact table style, moved below form
- `src/app/globals.css` — add keyframe animations, refine CSS variables

### Files to Keep (minor tweaks only)
- `src/app/layout.tsx` — unchanged
- `src/components/ui/MarkdownRenderer.tsx` — unchanged
- `src/components/ui/StanceBadge.tsx` — update colors to match agent palette
- `src/components/ui/ConfidenceBadge.tsx` — make it a thin bar instead of text
- `src/components/workspace/InterventionPanel.tsx` — restyle to match new design
- `src/hooks/*` — unchanged (data layer stays the same)

---

## Implementation Order

Execute in this order to maintain a working app at each step:

1. **Install dependencies**: `npm install framer-motion lucide-react`
2. **Update `globals.css`**: Add keyframe animations and refine variables
3. **Create design system atoms**: `AgentAvatar.tsx`, `TokenBudgetBar.tsx`, `NotificationBanner.tsx`
4. **Rebuild landing page**: Hero, HowItWorks, AgentShowcase, AgentDiagram, redesigned form
5. **Create `StageProgressBar.tsx`**: Replace RoundProgressIndicator
6. **Create `AgentArena.tsx`**: The visual centerpiece
7. **Create `DebateChat.tsx` + `DebateMessage.tsx`**: Chat-style timeline
8. **Create `WorkspaceTabs.tsx`**: Tab navigation for main content
9. **Rebuild `WorkspaceLayout.tsx`**: Integrate all new components
10. **Create `ResultsDashboard.tsx`**: Summary view with consensus meter
11. **Redesign `ArtifactCard.tsx`**: Visual upgrade with colored borders
12. **Polish**: Transitions, empty states, loading states, notification banners

---

## Key UX Principles

1. **Show, don't tell.** Every state should be visually represented, not just described in text.
2. **Progressive disclosure.** Show the essential information first; details on click/expand.
3. **Activity-first.** When a round is running, the live activity is the primary focus.
4. **Color = meaning.** Agent colors are consistent everywhere. Artifact type colors never mix with agent colors.
5. **One primary action.** At any given state, there's exactly one obvious "next thing to do" for the user.
6. **No dead ends.** Empty states always tell the user what to do next.
7. **Celebrate outcomes.** When consensus is reached or artifacts are created, give visual feedback (subtle animation, color pop).

---

## Accessibility Notes

- All interactive elements must have focus-visible outlines
- Agent colors must pass WCAG AA on dark backgrounds (use lighter shades for text: -300/-400 variants)
- Animations respect `prefers-reduced-motion` (use framer-motion's `useReducedMotion` hook)
- All images/icons have aria-labels
- Tab navigation works through the entire workspace
- Status changes announced via aria-live regions

---

## Demo-Specific Polish

For the hackathon demo video specifically:

1. **Pre-seed a session** with an interesting engineering problem so the demo doesn't start from scratch
2. **Use a fast model** so rounds complete quickly during recording
3. **The Agent Arena animation is the money shot** — make sure it looks smooth at 30fps screen recording
4. **Add a subtle "Round Complete" celebration** — confetti or color flash, brief (1s)
5. **The landing page hero diagram should animate on load** — connections light up one by one over 2s, then pulse steadily
