RepoScope — Final Product & Brand Decisions

1. Product Name

RepoScope

RepoScope is the locked product name.

The name communicates repository inspection, codebase visibility, and pre-shipping review. It is broad enough to support security checks, bug finding, architecture review, performance analysis, repo explanation, and production-readiness reports.

⸻

2. Tagline

Scope your repo before you ship.

This is the locked tagline.

It is short, developer-friendly, and directly connects the product name with the product action.

⸻

3. Product Identity

RepoScope helps developers inspect any GitHub repo before shipping, using AI agents to find bugs, security risks, architecture issues, and clear fixes.

The product should feel like a serious developer tool, not a generic AI chatbot or multi-agent demo.

Primary user promise:

Paste a GitHub repo. Ask what’s risky. Get a file-level report you can fix.

⸻

4. Positioning

RepoScope is not mainly a “multi-agent debate app.”

RepoScope is an AI repository review tool.

The multi-agent system is a trust/quality mechanism behind the scenes. The user-facing value is the final report: findings, risks, affected files, and fixes.

Core positioning:

AI repo reviews with evidence.

⸻

5. Main User Flow

The default product flow is:

1. Paste GitHub repository
2. Choose what to check
3. Ask a question or select a review type
4. Run analysis
5. Receive a structured repo review report
6. Inspect findings, files, and agent reasoning if needed

The user should never feel forced to understand agents, rounds, artifacts, consensus, or token budgets before getting value.

⸻

6. Landing Page Goal

The landing page must answer three questions within 5 seconds:

1. What is this?
2. What do I do first?
3. What will I get?

The hero should include the first action directly:

* GitHub repo input
* Analysis type selector
* Analyze repo button

The landing page should not hide the core action far below the fold.

⸻

7. Core CTA

Primary CTA:

Analyze repo

Secondary CTA:

View sample report

Avoid vague CTAs such as:

* Start Review
* Start Decision Review
* Begin Session
* Explore Workflow

⸻

8. Brand Colors

Locked color system:

Brand background:     #07090D
Main surface:         #0D1117
Raised surface:       #111827
Soft border:          #1F2937
Primary text:         #F8FAFC
Secondary text:       #94A3B8
Muted text:           #64748B
Brand violet:         #7C3AED
Violet hover:         #8B5CF6
Violet soft bg:       rgba(124, 58, 237, 0.12)
Violet glow:          rgba(124, 58, 237, 0.24)
Success:              #22C55E
Warning:              #F59E0B
Danger:               #EF4444
Code blue:            #38BDF8

Color rule:

Violet is the brand color. Red, amber, and green are only for severity/status.

⸻

9. Typography

Locked typography:

Primary font: Geist Sans
Technical font: JetBrains Mono

Usage:

Geist Sans:

* headings
* body text
* buttons
* navigation
* cards
* marketing copy

JetBrains Mono:

* repository names
* file paths
* code snippets
* severity tags
* scores
* terminal-like labels

Typography should feel clean, technical, and trustworthy.

⸻

10. Logo Direction

Locked logo concept:

Repository + scope/lens

The logo should communicate repository inspection.

Preferred visual elements:

* Git branch nodes
* code file or folder
* circular scope/lens overlay
* rounded-square app icon container

Avoid:

* robot
* brain
* sparkle
* rabbit
* mascot
* shield-only logo
* generic abstract cube
* complex four-agent network diagram

The mark must work at favicon size.

⸻

11. Logo Generation Prompt

Design a minimal vector logo for a developer tool called “RepoScope”.
Concept: a Git repository or code folder being inspected through a scope/lens. The logo should combine a simple repository symbol, such as branching nodes or a code file/folder, with a circular lens or target scope overlay.
Style: modern, sharp, premium developer-tool branding. Dark background. Clean geometric shapes. Minimal details. No mascot. No robot. No brain. No sparkles. No shield-only icon. The mark must be readable at small sizes like a favicon.
Color palette:
- near-black background #07090D
- brand violet #7C3AED
- soft violet highlight #8B5CF6
- optional code blue accent #38BDF8
- white/off-white text #F8FAFC
Logo requirements:
- create an icon mark plus wordmark
- wordmark text: RepoScope
- typography should feel like a serious engineering tool, similar to Geist Sans or Inter
- icon should fit inside a rounded square app icon
- flat vector style
- high contrast
- no gradients unless very subtle
- no 3D, no glassmorphism, no cartoon style
- clean SVG-friendly shapes
- balanced spacing
- professional SaaS/developer product look
Deliver variations:
1. full horizontal logo with icon + RepoScope wordmark
2. icon-only version for favicon
3. dark background version
4. monochrome version

⸻

12. Copywriting Rules

RepoScope copy should sound like a senior engineer, not like generic AI marketing.

Use short, direct, developer-focused language.

Good words:

* scan
* inspect
* review
* find
* fix
* risky
* file
* route
* auth
* secret
* deploy
* production
* repo
* codebase

Avoid generic AI/SaaS words:

* unlock
* empower
* seamless
* robust
* intelligent
* comprehensive
* next-generation
* actionable intelligence
* decision intelligence

Preferred tone:

Clear, technical, calm, confident.

Example copy:

Good:
“Find risky files before they reach production.”

Bad:
“Transform engineering tradeoffs into actionable multi-agent decision intelligence.”

⸻

13. UI Information Hierarchy

RepoScope should follow this hierarchy:

1. Repository
2. User question / review type
3. Final report
4. Findings
5. Affected files
6. Suggested fixes
7. Agent reasoning

The agent system should support the experience, not dominate it.

Rule:

Repo first. Finding second. Agent third.

⸻

14. Navigation

Recommended main navigation:

* Dashboard
* New Review
* Reports
* Repositories
* Settings

Recommended report tabs:

* Report
* Findings
* Files
* Agent Debate
* Export

Avoid user-facing labels like:

* Artifacts
* Consensus
* Intervention
* Round
* Proposal
* Critique
* Revision

Those can exist internally, but should not be the default language for users.

⸻

15. Report Page Direction

The report page is the most important product screen.

It should look like a professional code/security audit report.

Recommended report structure:

RepoScope Review
Repository: owner/repo
Question: Find vulnerabilities before deployment
Verdict: Fix before production
Score: 68/100
Critical Findings
1. Missing authorization check in /api/admin
2. Secret-like token found in config
3. User input reaches database query without validation
Medium Findings
...
Fix Plan
1. Add middleware auth guard
2. Move secrets to environment variables
3. Add validation schema
4. Add tests for permission boundaries

Every finding should answer:

* What is wrong?
* Where is it?
* Why does it matter?
* How do I fix it?
* Which agent found it?

⸻

16. Default Review Types

Recommended review types:

* Security vulnerabilities
* Bugs and edge cases
* Architecture review
* Performance issues
* Production readiness
* Explain this repo
* What should I refactor first?

These should appear as quick-start options in the new review form.

⸻

17. Features to Hide by Default

These are power-user/internal features and should not appear in the first-time default flow:

* token budget
* clarification policy
* prior session context
* intervention panel
* consensus percentage
* rounds
* artifacts
* raw agent debate
* internal stage names

They can stay in advanced settings or secondary tabs.

⸻

18. Design Principle

RepoScope should not expose system complexity before user value.

Locked principle:

Show the result first. Show the machinery second.

The app should feel useful before it feels impressive.

⸻

19. Product Quality Standard

Every screen should pass this test:

Would a tired developer understand this instantly at 1 AM before deploying?

If not, the screen is too complicated.

⸻

20. Next Implementation Order

Fix the product one detail at a time.

Recommended order:

1. Brand variables in globals.css
2. App name and metadata
3. Hero section
4. New review form
5. Sample report
6. Report page
7. Findings page
8. Agent debate page
9. Empty/loading states
10. Final copy cleanup

Avoid bulk redesigns. Bulk fixes are acceptable for prototypes, but RepoScope now needs careful product-level refinement.