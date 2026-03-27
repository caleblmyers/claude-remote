---
name: test-mobile
description: Run Playwright mobile e2e tests against a mock backend. Use when the user says "test mobile", "run e2e", "mobile tests", "playwright", or "test the app".
disable-model-invocation: false
user-invocable: true
---

# Mobile E2E Tests

Run Playwright e2e tests with mobile device emulation against a mock backend.

## 1. Install Browsers (if needed)

Check if Playwright browsers are installed:

```bash
cd app && npx playwright install --with-deps chromium webkit 2>&1 | tail -3
```

## 2. Run Tests

By default, run all mobile profiles:

```bash
pnpm test:e2e
```

If the user specifies a device:
- iPhone: `cd app && pnpm test:e2e:iphone`
- Pixel: `cd app && pnpm test:e2e:pixel`

If the user wants headed mode (visible browser):
```bash
cd app && pnpm test:e2e:headed
```

If the user wants the interactive UI:
```bash
cd app && pnpm test:e2e:ui
```

## 3. Report Results

Format as a table:

| Suite | Tests | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| login | ... | ... | ... | ... |
| home | ... | ... | ... | ... |
| new-task | ... | ... | ... | ... |
| task-detail | ... | ... | ... | ... |
| settings | ... | ... | ... | ... |
| navigation | ... | ... | ... | ... |

### Failures (if any)

List each failure with test name, error message, and screenshot path.

### Verdict

All passed / N failures — summary of what broke.
