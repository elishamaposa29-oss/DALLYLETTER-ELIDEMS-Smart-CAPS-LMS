# Dallyletter Elidems — search and social measurement plan

This document defines how to measure discovery after the public pages are deployed. It deliberately contains no invented traffic, ranking, follower or conversion numbers.

## 1. Google Search Console setup gate

Canonical property: `https://dallyletter-elidems-onlineschoolbye-two.vercel.app/`

After the approved branch is deployed:
1. Verify the URL-prefix property using the HTML verification tag already included in the homepage. Compare the live token with the token displayed by Google before clicking Verify.
2. Submit `https://dallyletter-elidems-onlineschoolbye-two.vercel.app/sitemap.xml`.
3. Inspect the homepage and each of the six public pages with URL Inspection.
4. Record any indexing exclusions and fix only causes supported by the report.
5. Do not report the site as verified or indexed until Search Console shows that result.

Search Console access and verification must be completed by the Google account owner. This repository cannot verify an external Google account.

## 2. First measurement baseline

Set the baseline date to the first day Search Console has usable data after deployment. For the initial period, write “not yet available” rather than substituting zero when Google has not populated a report.

| Metric | Source | Review |
|---|---|---|
| Indexed public pages / submitted public pages | Search Console Page indexing + Sitemaps | Weekly |
| Search impressions and clicks | Search Console Performance | Weekly |
| Average position and click-through rate | Search Console Performance | Weekly |
| Branded queries: Dallyletter, Dallyletter Elidems | Search Console query filter | Weekly |
| Non-branded Zimbabwe/South Africa education queries | Search Console query filter | Weekly |
| Organic landing pages | Search Console Pages report | Weekly |
| Social reach, impressions and video watch time | Native platform analytics | Weekly |
| Social referral sessions | Website analytics with campaign tags | Weekly |
| Registrations and learner activation from organic/social | Product analytics, if reliable and privacy-compliant | Monthly |
| Educator enquiries and institutional conversations | Recorded enquiry log | Monthly |

## 3. Weekly reporting template

Copy one row per week. Keep the date range identical when comparing periods.

| Week ending | Search impressions | Search clicks | CTR | Avg position | Indexed / submitted | Branded clicks | Non-branded clicks | Social referral sessions | Registrations | Active learners | Educator / school enquiries | Notes |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---|
| Not started | Not yet available | Not yet available | Not yet available | Not yet available | Pending deployment | Not yet available | Not yet available | Not yet available | Not yet available | Not yet available | Not yet available | Establish after deployment and data collection |

## 4. Campaign link convention

Use consistent UTM tags on links shared in social posts. Keep the canonical page URL unchanged; add tags only to campaign links.

Example:
`https://dallyletter-elidems-onlineschoolbye-two.vercel.app/learners?utm_source=facebook&utm_medium=social&utm_campaign=brand_launch_2026_11`

Approved values:
- `utm_source`: facebook, instagram, tiktok, youtube, linkedin
- `utm_medium`: social, video, profile
- `utm_campaign`: brand_launch_2026_11, study_tips_2026_11, educator_intro_2026_11

Do not put personal information, learner names, email addresses or account identifiers in URLs.

## 5. Interpretation rules

- Compare equivalent date ranges and annotate content releases or deployment changes.
- Search impressions measure appearances, not visits. Clicks measure visits from Google results.
- Average position varies by query, device, country and time; do not treat one average as a universal rank.
- Social views and followers are not equivalent to learners or customers.
- A registration is not the same as an active learner. Define activation using a real, observable learning action before reporting it.
- Report the geographic filter and query group used. Do not describe Zimbabwe/South Africa performance using worldwide totals.
- Do not promise Google rankings, autocomplete suggestions or a fixed indexing date.

## 6. Reporting cadence

- First 4 weeks after deployment: weekly checks for crawl errors, indexing, search queries and social referral quality.
- Thereafter: monthly review of search visibility, audience quality, registration conversion, learner activation and institutional enquiries.
- Make content decisions from actual query and audience evidence. Improve pages that answer real user needs; do not mass-produce thin keyword pages.
