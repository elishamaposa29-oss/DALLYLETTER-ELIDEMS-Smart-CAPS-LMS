# Dallyletter Elidems — GitHub Actions Setup

> **Secure automation setup** · Google Search Console · Demo-account browser captures  
> Repository: [DALLYLETTER-ELIDEMS-Smart-CAPS-LMS](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS)

This guide configures the repository-level variable and secrets consumed by the Dallyletter GitHub Actions workflows. Follow the copy sheets exactly. Replace every value instruction with the real value from the relevant account; never save example text as a credential.

## 1. Open the correct GitHub settings page

**[OPEN GITHUB ACTIONS SECRETS & VARIABLES](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/settings/secrets/actions)**

On that page:
- Use **Secrets** → **New repository secret** for passwords and private JSON keys.
- Use **Variables** → **New repository variable** for the public Search Console property URL.
- Keep all credentials at repository-secret level. Do not put passwords or private keys in Variables, source files, commits, issues, pull requests, screenshots, or workflow logs.

## 2. Repository variable — Google Search Console property

Create exactly one repository variable:

| Field | Copy exactly |
|---|---|
| Name | `GSC_SITE_URL` |
| Value | `https://dallyletter-elidems-onlineschoolbye-two.vercel.app/` |

The value must match the verified URL-prefix property in Google Search Console exactly, including `https://` and the trailing slash.

### Copy sheet — variable

```text
GSC_SITE_URL
https://dallyletter-elidems-onlineschoolbye-two.vercel.app/
```

## 3. Repository secret — Google service-account key

Create this repository secret:

| Field | Copy exactly |
|---|---|
| Name | `GSC_SERVICE_ACCOUNT_JSON` |
| Secret value | The complete JSON key file downloaded for the Google Cloud service account |

### Copy sheet — secret name

```text
GSC_SERVICE_ACCOUNT_JSON
```

**Important:** The secret value is not a filename, email address, partial JSON, or placeholder. Open the downloaded service-account JSON key file and paste its entire contents into GitHub's **Secret** value field. The key must contain the service-account fields including `client_email` and `private_key`. Do not paste the JSON into this document, a chat, a commit, or a pull request.

Before running the workflows:
1. Enable the **Google Search Console API** in the Google Cloud project.
2. Add the service-account email (the JSON's `client_email`) as a user of the exact verified Search Console property.
3. Grant the access needed for Search Analytics, URL Inspection, and sitemap submission.
4. Confirm the property URL matches `GSC_SITE_URL`.

## 4. Showcase demo-account secrets

The showcase workflow uses dedicated test accounts to sign in and capture real role dashboards. Create each item as a **repository secret**. Use the exact login email and password for the corresponding dedicated demo account in the deployed Dallyletter environment.

### Learner — copy sheet

```text
SHOWCASE_LEARNER_EMAIL
<PASTE THE DEMO LEARNER EMAIL AS THE SECRET VALUE>

SHOWCASE_LEARNER_PASSWORD
<PASTE THE DEMO LEARNER PASSWORD AS THE SECRET VALUE>
```

### Teacher — copy sheet

```text
SHOWCASE_TEACHER_EMAIL
<PASTE THE APPROVED DEMO TEACHER EMAIL AS THE SECRET VALUE>

SHOWCASE_TEACHER_PASSWORD
<PASTE THE DEMO TEACHER PASSWORD AS THE SECRET VALUE>
```

### Manager — copy sheet

```text
SHOWCASE_MANAGER_EMAIL
<PASTE THE DEMO MANAGER EMAIL AS THE SECRET VALUE>

SHOWCASE_MANAGER_PASSWORD
<PASTE THE DEMO MANAGER PASSWORD AS THE SECRET VALUE>
```

### Owner — copy sheet

```text
SHOWCASE_OWNER_EMAIL
<PASTE THE DEMO OWNER EMAIL AS THE SECRET VALUE>

SHOWCASE_OWNER_PASSWORD
<PASTE THE DEMO OWNER PASSWORD AS THE SECRET VALUE>
```

Replace the angle-bracket instructions with actual values in GitHub's secret-value field. Do not create secrets whose values literally contain the angle-bracket instructions. Use non-production demo accounts with only the access required for the showcase. Never use a personal owner password or a production administrator password for screenshots.

## 5. Add each secret in GitHub

For every secret above:

1. Open [Repository Actions secrets](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/settings/secrets/actions).
2. Under **Repository secrets**, select **New repository secret**.
3. Paste the exact secret name from the copy sheet into **Name**.
4. Paste the real credential or complete JSON contents into **Secret**.
5. Select **Add secret**.
6. Repeat for each remaining secret.

GitHub does not reveal a saved secret's value later. If a value is wrong, update the secret with the correct value.

## 6. Run the workflows

Once the variable and required secrets are configured:

| Workflow | Direct link | Purpose |
|---|---|---|
| Google Search Console Performance Report | [Open workflow](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/actions/workflows/gsc-performance-report.yml) | Weekly 28-day comparison: clicks, impressions, CTR, average position, queries, landing pages and URL inspection |
| Submit Dallyletter Sitemap to Google | [Open workflow](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/actions/workflows/gsc-submit-sitemap.yml) | Manually submit the deployed `/sitemap.xml` |
| Dallyletter Real UI Showcase Capture | [Open workflow](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/actions/workflows/dallyletter-showcase-capture.yml) | Capture public pages and configured learner, teacher, manager and owner dashboards |

For each workflow:
1. Open its direct link.
2. Select **Run workflow**.
3. Select the intended branch containing the workflow.
4. Start the run and inspect the result under **Actions**.

Run sitemap submission only after the public website build containing the sitemap is deployed. The performance workflow is also scheduled for Mondays at 07:00 UTC. Its Markdown report is attached as a downloadable Actions artifact and included in the run summary.

The showcase workflow may still capture public pages if demo credentials are not configured; role-specific captures are skipped when their email/password pair is absent. Configure all eight showcase secrets to enable all four role captures.

## 7. What success looks like

- **Search Console report:** a successful run with a 28-day comparison and a downloadable Markdown report.
- **Sitemap submission:** a successful API response for the exact production sitemap URL.
- **Showcase capture:** a successful run with screenshots and a capture manifest for the public pages and each configured role.
- **Security:** no credentials appear in logs, artifacts, screenshots, source code, or Git history.

A successful sitemap submission does not guarantee indexing or search rankings. Google controls crawling, indexing, and ranking.

## 8. Troubleshooting

- **Google OAuth / 401:** check that the complete JSON key is valid, not revoked, and has the correct `client_email` and `private_key`.
- **Search Console 403:** add the service-account email to the exact URL-prefix property with the required permissions.
- **Property not found:** verify the protocol, hostname, and trailing slash in `GSC_SITE_URL`.
- **No role screenshot:** confirm both secrets for that role exist and belong to a working demo account; verify that the account is approved and routed to the expected dashboard.
- **Login selector or route failure:** inspect the workflow artifact/logs and update the capture script to match the current production login UI and authorized role routes. Do not weaken application authorization to make a screenshot pass.

---
**Dallyletter Elidems** · Zimbabwe first, not Zimbabwe only.
