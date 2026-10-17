# Elidems Backup Manifest

- Project: Dallyletter Elidems Smart CAPS LMS
- Purpose: inventory of repository/configuration backup only. This is **not** proof that production database data is backed up.
- Canonical repository: https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS
- Canonical Render API: DALLYLETTER-ELIDEMS-Smart-CAPS-LMS-4 (srv-d9ihv8favr4c73assgag)
- Production branch: main

## Explicit backup status

- PostgreSQL dump of the suspended original database: **NOT CREATED / NOT VERIFIED**.
- Encrypted secret backup: **NOT CREATED / NOT VERIFIED**.
- Restore test against an isolated database: **NOT COMPLETED**.
- Replacement database schema initialization: **completed by the deployment build**, but live feature and role verification remains a separate gate.
- Historical accounts, lessons, exercises, submissions, marks, and other records from the old database are not present merely because a new schema was created.

## Safety rules

- Do not put database URLs, API keys, VAPID private keys, or owner passwords in this manifest or source control.
- Do not delete the original suspended database until the owner confirms after replacement verification.
- A backup is valid only after a real dump is stored securely and a restore test succeeds.
- Update this manifest only when evidence supports the new status.
