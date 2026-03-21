# Claude Remote — UX Screen Map

Mobile-first PWA interface. All screens designed for phone viewport.

---

## Screen Map

```
Home (task list)
├── + New Task
│   ├── Repo Picker
│   └── Task Input (templates + free text)
├── Task Detail (tap any task)
│   ├── Summary panel (top)
│   ├── Output stream (bottom, expandable)
│   └── Reply input (bottom bar)
├── Approval Card (from push notification)
└── Settings
    ├── Repos
    ├── Templates
    ├── Trust Defaults
    └── Notifications
```

---

## 1. Home Screen

The first thing you see. Answers: "What's happening right now?"

```
┌─────────────────────────────┐
│  Claude Remote          ⚙️   │
├─────────────────────────────┤
│                              │
│  ▶ task-toad                 │
│    Fixing auth bug...        │
│    ██████░░░░  Step 3/5      │
│    [View]  [Stop]            │
│                              │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│                              │
│  ✓ brain  (2m ago)           │
│    Updated study plan        │
│    3 files changed           │
│    [Review]                  │
│                              │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│                              │
│  ✗ middlelands  (1h ago)     │
│    Tests failed: 2 errors    │
│    [View Error]              │
│                              │
├─────────────────────────────┤
│                              │
│      [ + New Task ]          │
│                              │
└─────────────────────────────┘
```

**Behavior:**
- Active tasks always at top, sorted by most recently updated
- Completed/failed tasks below, limited to last few
- Each card shows: repo name, status icon, one-line summary, action buttons
- Pull to refresh
- Task cards are tappable → opens detail view

**Status icons:**
- ▶ Running (blue)
- ⏸ Waiting for approval (amber)
- ✓ Completed (green)
- ✗ Failed (red)
- ⏹ Stopped (gray)

---

## 2. New Task Flow

### Step 1: Repo Picker

```
┌─────────────────────────────┐
│  ◀ New Task                  │
├─────────────────────────────┤
│                              │
│  Pick a repository:          │
│                              │
│  ┌─────────────────────────┐ │
│  │ 🐸  task-toad           │ │
│  │     ~/task-toad         │ │
│  └─────────────────────────┘ │
│  ┌─────────────────────────┐ │
│  │ 🧠  brain               │ │
│  │     ~/brain             │ │
│  └─────────────────────────┘ │
│  ┌─────────────────────────┐ │
│  │ ⚔️  middlelands-io      │ │
│  │     ~/middlelands-io    │ │
│  └─────────────────────────┘ │
│  ┌─────────────────────────┐ │
│  │ 🎬  movie-night-picker  │ │
│  │     ~/movie-night-picker│ │
│  └─────────────────────────┘ │
│                              │
└─────────────────────────────┘
```

### Step 2: Task Input

```
┌─────────────────────────────┐
│  ◀ task-toad                 │
├─────────────────────────────┤
│                              │
│  Quick actions:              │
│  [Run Tests] [Fix Lint]      │
│  [Fix Bug]   [Code Review]   │
│                              │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│                              │
│  Trust level:                │
│  ○ Read only (safest)        │
│  ● Edit freely               │
│  ○ Full auto (fastest)       │
│  ○ Custom...                 │
│                              │
├─────────────────────────────┤
│                              │
│  Describe the task...        │
│                              │
│  [Send]                      │
│                              │
└─────────────────────────────┘
```

**Trust level presets:**
- **Read only:** auto-approve Read, Grep, Glob. Ask for everything else.
- **Edit freely:** auto-approve Read, Grep, Glob, Edit. Ask for Bash, Write.
- **Full auto:** auto-approve everything. No interruptions.
- **Custom:** pick individual tools to auto-approve.

**Quick action behavior:** Tapping a template fills the text field and optionally sets a trust level. You can edit before sending.

---

## 3. Task Detail (Split View)

```
┌─────────────────────────────┐
│  ◀ task-toad: auth fix   ⏹   │
├─────── SUMMARY ─────────────┤
│  Status: Running (Step 3/5)  │
│  Duration: 2m 34s            │
│                              │
│  ✓ 1. Read auth module       │
│  ✓ 2. Identified bug         │
│  ▶ 3. Applying fix           │
│    auth.ts L42-58            │
│  ○ 4. Run tests              │
│  ○ 5. Summary                │
│                              │
│  Files touched:              │
│  auth.ts, session.ts         │
│                              │
├─────── OUTPUT ──────────────┤
│  > Reading auth.ts...        │
│  > Found issue: token not    │
│    refreshed on 401 response │
│  > Editing auth.ts           │
│    - Line 42: removed stale  │
│      token check             │
│    + Line 42: added refresh  │
│      on 401                  │
│  > Editing session.ts        │
│    ...                       │
│                              │
├─────────────────────────────┤
│  Type a reply...      [Send] │
└─────────────────────────────┘
```

**Behavior:**
- Summary panel is collapsible (swipe up to expand output)
- Output panel auto-scrolls to bottom (latest output)
- Tap any step to see its full detail
- Tap a file name to see the diff for that file
- Reply input allows sending follow-up instructions to the session
- Stop button (⏹) in header to kill the task

---

## 4. Approval Card

Appears when tapping a push notification, or inline in the task detail when a permission request is pending.

```
┌─────────────────────────────┐
│  ⚠️  Permission Request      │
├─────────────────────────────┤
│                              │
│  task-toad • auth fix        │
│  Step 4 of 5                 │
│                              │
│  Claude wants to run:        │
│  ┌─────────────────────────┐ │
│  │ $ npm test              │ │
│  └─────────────────────────┘ │
│                              │
│  Why:                        │
│  Applied fix to auth.ts.     │
│  Need to verify tests pass   │
│  before proceeding to        │
│  commit.                     │
│                              │
│  ┌──────────┐ ┌──────────┐  │
│  │ ✓ Approve│ │ ✗ Deny   │  │
│  └──────────┘ └──────────┘  │
│                              │
│  [ Auto-approve Bash for     │
│    this session ]            │
│                              │
└─────────────────────────────┘
```

**Behavior:**
- Shows tool name, full command/parameters, and Claude's reasoning
- Approve/Deny buttons are large, thumb-friendly targets
- Optional "auto-approve [tool] for this session" link to reduce future interruptions
- If multiple approvals are pending, swipeable cards (left/right)

---

## 5. Settings

```
┌─────────────────────────────┐
│  ◀ Settings                  │
├─────────────────────────────┤
│                              │
│  Repositories                │
│  ─────────────────────────── │
│  task-toad     ~/task-toad   │
│  brain         ~/brain       │
│  middlelands   ~/middle...   │
│  movie-night   ~/movie-...   │
│  [ + Add Repo ]              │
│                              │
│  Default Trust Level         │
│  ─────────────────────────── │
│  Currently: Edit freely      │
│  [Change]                    │
│                              │
│  Notifications               │
│  ─────────────────────────── │
│  Completions      [ON]       │
│  Errors           [ON]       │
│  Permissions      [ON]       │
│                              │
│  Templates                   │
│  ─────────────────────────── │
│  Global: 4 templates         │
│  Per-repo: 2 overrides       │
│  [Manage Templates]          │
│                              │
│  Server                      │
│  ─────────────────────────── │
│  Connected: 100.x.x.x:3000  │
│  Status: Online              │
│  [Disconnect]                │
│                              │
└─────────────────────────────┘
```

---

## Navigation Model

**No bottom tab bar.** The app is simple enough to be a single stack:

```
Home → New Task (repo → input)
Home → Task Detail → Diff View
Home → Settings → Sub-settings
Push Notification → Approval Card → Home
```

Swipe back or ◀ button to navigate up. Keeps the UI focused and uncluttered.

---

## Responsive Considerations

- All touch targets: minimum 44x44px
- Approval buttons: extra large, bottom of screen (easy thumb reach)
- Text input: auto-focus keyboard on task input screen
- Output stream: monospace font, horizontal scroll for long lines
- Summary steps: collapsible accordion
- Dark mode support from day one (you're a developer, you'll use this at night)
