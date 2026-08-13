# Maestro E2E Flows

Basic smoke-test flows for the P-Search Mobil Android app, introduced during the 2026-08-13 audit to start covering full user flows beyond unit/component tests. These flows are **written but not yet run in this environment** (no Android device/emulator available here) -- run and validate them before relying on them in CI.

## Setup (one-time, on a machine with a device/emulator)

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

## Running

```bash
# Build a debug APK first (or point at an already-installed dev build)
eas build --platform android --profile development --local
maestro test .maestro/
```

## What's covered so far

- `01-launch-shows-auth-screen.yaml` -- app launches without a session and shows the Auth (sign-in) screen, not a blank/crashed screen. This is the mobile equivalent of the blank-screen production bug found on the web deploy during the audit (missing env vars at build time).
- `02-toggle-to-registration.yaml` -- the login/registration toggle on the Auth screen actually flips the form.

## Suggested next flows (not yet written)

- Full sign-up/sign-in with a real or seeded test account
- Onboarding form completion
- Home screen match list rendering
- Navigating to ActionPlan and back (regression guard for the back-button fix from this session)
- Paywall open/close
