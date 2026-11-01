# Security and publication

The frontend is a static website. Supabase Auth, database policies, and private
Storage enforce account and data access; hiding frontend controls is not an
access-control mechanism. SQL migrations and the Supabase publishable key are
safe to publish. Secret/service-role keys, SMTP credentials, and database
passwords must never enter frontend code, Git, or the published build.
Vite exposes only the two Supabase configuration prefixes. Startup/builds reject
non-publishable frontend keys, credential-bearing URLs, and remote HTTP Supabase
URLs, so old local participant keys do not enter the client environment.

## Checks before publishing

Use a current Node 24 LTS release (`.nvmrc`), then run:

```sh
npm ci --ignore-scripts
npm run lint
npm test
npm run build
npm run security:check
```

The publication guard scans the working tree, Git index, public assets (even
ignored files), and build for private filenames and supported credential patterns.
It reports file locations and secret types, never matched credential values.
It is a pattern-based guard, not proof that every possible secret is absent.
Enable GitHub's own secret scanning and push protection as well. Rotate any
credential found in Git history; deleting its file alone does not revoke it.

The modern lint toolchain uses a `minimatch` 11 override to address
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
Its glob API is exercised by the lint run. Node 22.13+ or Node 24+ is required;
use the current Node 24 LTS patch for local work and CI.

The GitHub checks workflow uses pinned Actions, a read-only repository token,
Node 24, no project credentials, and no deployment step. Dependabot proposes
package and Actions updates for review.

## Application protections

- Email/password handling stays in Supabase Auth. Public profiles contain only
  usernames and IDs; passwords and emails are not copied into app tables/logs.
- Redirects accept known internal destinations. Catalog links and images are
  validated on read as well as on submission.
- React renders opinions/titles as text. The Unity error banner also uses text,
  and the melody code editor parses literals without evaluating JavaScript.
- The React app’s production HTML has a Content Security Policy blocking external/inline scripts,
  object embeds, and base-element injection. Inline styles remain allowed for
  notation and component styling. HTTPS image/audio/API connections remain
  allowed because images and instrument samples can use external providers.
- Referrer metadata and external-link attributes reduce URL/opener leakage.
- Red Bull access is enforced in PostgreSQL and Storage for the two enabled
  accounts. Reviews are editable/deletable only by their owner. Image uploads
  use private Storage, an allowed MIME-type list, a 5 MB bucket limit, and
  user-owned immutable paths.
- Database tests verify guest denial, profile-column restrictions, owner/admin
  permissions, non-escalation, private drafts/uploads, and hidden future puzzles.

## Hosting and Supabase settings

1. GitHub repository settings: review secret-scanning alerts, enable available
   push protection, and enable Dependabot alerts/security updates.
2. GitHub Pages: enforce HTTPS for `mrbrodinha.com`. The built `CNAME` preserves
   the custom domain. Keep `.env`, local databases, and credentials out of `public/`.
3. Supabase: keep email confirmation enabled, restrict Auth redirect URLs to
   the documented production/local callback paths, configure public-user SMTP,
   and review Auth rate limits/CAPTCHA before opening signup broadly.
4. Retire any still-deployed legacy Google Sheets/Apps Script rating endpoint
   and remove its unused local participant-key variables. The current app does
   not use or secure that separate legacy service.
5. Keep RLS enabled, the Red Bull bucket private, and admin/access flags writable
   only through the dashboard/privileged database administration. Run Security
   Advisor and inspect the existing signup trigger and any custom policies.
6. GitHub Pages cannot provide arbitrary application response headers through
   an `_headers` file. If clickjacking protection or additional HTTP headers are
   required, configure them at a hosting proxy that supports response headers.
   A meta CSP cannot enforce `frame-ancestors` or replace server-side RLS.

Account/SMTP setup is in [docs/supabase-auth.md](docs/supabase-auth.md). Database
migration instructions are in the Brodle and Red Bull guides under `docs/`.

## Review scope — 1 November 2026

The dependency audit initially reported 20 vulnerable packages. Patched direct
and transitive dependencies now pass `npm audit` with zero reported
vulnerabilities. The review covered source, public/build assets, dependency advisories, known
credential patterns across local Git history, and the included SQL/security tests.
Read-only anonymous probes against the configured Supabase project returned no
catalog rows, denied ratings/private melodies/access flags, found no profile
email column, and confirmed that email confirmation is required.

Those probes do not reveal the full live RLS policy definitions, signup-trigger
SQL, SMTP setup, admin settings, or the private bucket's owner configuration.
Authenticated cross-user permission checks run in local embedded PostgreSQL;
they are not a privileged audit of the live project. The bundled Unity/WASM
engine and upstream services are outside a full source-level audit.

Sources: [GitHub HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https),
[GitHub secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning),
[push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection),
[Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).
