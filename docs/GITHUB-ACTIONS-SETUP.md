# Dallyletter Elidems — GitHub Actions Setup

> Secure automation setup · Google Search Console · Non-owner showcase captures  
> Repository: [DALLYLETTER-ELIDEMS-Smart-CAPS-LMS](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS)

This guide configures the repository variable and secrets used by Dallyletter's GitHub Actions. Use dedicated non-production demo accounts. Never put passwords or private keys in source files, commits, issues, pull requests, screenshots, or logs.

## 1. Open GitHub Actions secrets and variables

[OPEN GITHUB ACTIONS SECRETS & VARIABLES](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/settings/secrets/actions)

- Use **Repository secrets** for passwords and private JSON keys.
- Use **Repository variables** for non-secret configuration such as the public Search Console property URL.

## 2. Google Search Console property variable

Create one repository variable:

| Field | Exact value |
|---|---|
| Name | `GSC_SITE_URL` |
| Value | `https://dallyletter-elidems-onlineschoolbye-two.vercel.app/` |

Copy sheet:

```text
GSC_SITE_URL
https://dallyletter-elidems-onlineschoolbye-two.vercel.app/
```

The value must exactly match the verified URL-prefix property in Search Console, including protocol and trailing slash.

## 3. Google service-account secret

Create this repository secret:

| Field | Exact value |
|---|---|
| Name | `GSC_SERVICE_ACCOUNT_JSON` |
| Secret value | Entire contents of the downloaded Google service-account JSON key file |

Copy sheet for the secret name:

```text
GSC_SERVICE_ACCOUNT_JSON
```

Paste the complete JSON file contents into GitHub's secret-value field. It must include `client_email` and `private_key`. Do not paste the JSON into this document, chat, source code, issues, pull requests, or logs.

Before running the workflows:

1. Enable the Google Search Console API in the Google Cloud project.
2. Add the service-account email (`client_email`) as a user of the exact verified Search Console property.
3. Grant the access required for Search Analytics, URL Inspection and sitemap submission.
4. Confirm the property URL matches `GSC_SITE_URL`.

## 4. Dedicated showcase-account secrets

The showcase workflow captures public pages and three non-owner roles only: learner, approved teacher and manager. Use dedicated test accounts on the deployment being tested. Do not use personal accounts or production credentials.

### Learner

```text
SHOWCASE_LEARNER_EMAIL
<PASTE THE DEDICATED DEMO LEARNER EMAIL AS THE SECRET VALUE>

SHOWCASE_LEARNER_PASSWORD
<PASTE THE DEDICATED DEMO LEARNER PASSWORD AS THE SECRET VALUE>
```

### Approved teacher

```text
SHOWCASE_TEACHER_EMAIL
<PASTE THE APPROVED DEMO TEACHER EMAIL AS THE SECRET VALUE>

SHOWCASE_TEACHER_PASSWORD
<PASTE THE DEMO TEACHER PASSWORD AS THE SECRET VALUE>
```

### Manager

```text
SHOWCASE_MANAGER_EMAIL
<PASTE THE DEMO MANAGER EMAIL AS THE SECRET VALUE>

SHOWCASE_MANAGER_PASSWORD
<PASTE THE DEMO MANAGER PASSWORD AS THE SECRET VALUE>
```

Replace the angle-bracket instructions with actual values in GitHub's secret-value field. Never create a secret whose value literally contains the instructions above. Create only the six secrets listed here.

**Owner access is deliberately excluded.** Do not create or supply Owner credentials for this screenshot workflow. Owner dashboards, owner credentials and private owner data must never enter public showcase artifacts.

## 5. Add each repository secret

For each secret:

1. Open [Repository Actions secrets](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/settings/secrets/actions).
2. Under **Repository secrets**, select **New repository secret**.
3. Paste the exact secret name.
4. Paste the real credential or complete JSON contents into the secret-value field.
5. Select **Add secret**.

GitHub does not reveal a saved secret's value later. If a value is wrong, update it with the correct value.

## 6. Run the workflows

| Workflow | Direct link | Purpose |
|---|---|---|
| Google Search Console Performance Report | [Open workflow](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/actions/workflows/gsc-performance-report.yml) | Weekly 28-day comparison of clicks, impressions, CTR, average position, queries, landing pages and URL inspection |
| Submit Dallyletter Sitemap to Google | [Open workflow](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/actions/workflows/gsc-submit-sitemap.yml) | Validate and submit the deployed `/sitemap.xml` |
| Dallyletter Real UI Showcase Capture | [Open workflow](https://github.com/elishamaposa29-oss/DALLYLETTER-ELIDEMS-Smart-CAPS-LMS/actions/workflows/dallyletter-showcase-capture.yml) | Capture public pages and configured learner, teacher and manager dashboards |

For a manual run:

1. Open the workflow link.
2. Select **Run workflow**.
3. Select the branch containing the workflow.
4. For showcase capture, supply the exact deployed preview or public site URL being tested.
5. Start the run and inspect its result and downloadable artifacts.

Run sitemap submission only after the target deployment serves the generated sitemap. The performance report is scheduled for Mondays at 07:00 UTC after this workflow is merged into the default branch. Its Markdown report is uploaded as an Actions artifact and included in the run summary.

The showcase workflow is manual so it cannot accidentally test an old production deployment every time the feature branch changes. It can capture public pages without demo credentials; role captures are skipped when either secret for that role is missing. Configure all six showcase secrets to capture all three non-owner roles.

## 7. What success looks like

- **Search Console report:** a successful run with current and previous 28-day metrics, query/page summaries and URL inspection results.
- **Sitemap submission:** the deployed sitemap is fetched and validated before Google receives the submission request.
- **Showcase capture:** a successful run with a manifest and screenshots for public pages and each configured non-owner role.
- **Security:** no credentials appear in logs, artifacts, screenshots, source code or Git history. Owner dashboards and credentials are excluded.

A successful sitemap submission does not guarantee indexing or search rankings. Google controls crawling, indexing and ranking.

## 8. Troubleshooting

- **Google OAuth / 401:** check that the complete JSON key is valid, not revoked, and contains the correct `client_email` and `private_key`.
- **Search Console 403:** add the service-account email to the exact URL-prefix property with the required permissions.
- **Property not found:** verify protocol, hostname and trailing slash in `GSC_SITE_URL`.
- **No role screenshot:** confirm both secrets for that role exist, belong to a dedicated test account, and the account has the correct approved role on the selected deployment.
- **Login selector or route failure:** inspect the workflow logs and update the capture script to match the current login UI and authorized role routes. Never weaken application authorization to make a screenshot pass.

---

**Dallyletter Elidems** · Zimbabwe first, not Zimbabwe only.
