# Test Credentials — Emergent CRM

> Updated 2026-06-19. All team passwords were reset to `emergent@12345`. Users can change their own password from the sidebar (Password button).

## Demo (the ONLY advertised login on the sign-in page)
- **demo@emergent.sh** / **demo12345** — admin/manager role, sees ALL demo data.
  - This account's password is self-healed to `demo12345` on every backend boot.

## Real team accounts (exist, but NOT shown on the login page)
- Manager (admin): **diyea@emergent.sh** / **emergent@12345**
- Agents (role=agent), all password **emergent@12345**:
  - aryan.f@emergent.sh
  - dipan@emergent.sh
  - vinay.p@emergent.sh
  - brian@emergent.sh
  - abhishek@emergent.sh

## Notes
- Backend reset migration: `reset_team_passwords_emergent12345_v1` (guarded by `migrations` collection — runs once; will NOT overwrite a user's later self-service change).
- Change-password endpoint: `POST /api/profile/password` { current_password, new_password } (min 8 chars).
- Base URL (preview): https://pipeline-hub-70.preview.emergentagent.com
- Production: https://emergentcrm.com (separate env; redeploy required to push code changes).
