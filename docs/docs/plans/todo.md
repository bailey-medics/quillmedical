# Project to-do list

## Branch protection

- [ ] Increase `required_approving_review_count` from 0 to 1 (or higher) in
      `infra/github/branch_rules.tf` when a second developer joins the team.
      Currently set to 0 because a solo developer cannot approve their own PRs.
      The PR requirement still creates an auditable change record for DCB 0129.

## Public site

- [ ] Update the EPR nav link from `https://staging.quill-medical.com` to the
      production URL once `quill-medical-production` is active. The link
      currently points to staging because the production GCP project is
      hibernated for cost savings.

- [ ] Add public pages to the production build and configure the 404 page:
      1. Update `frontend/Dockerfile` build stage to also run
         `yarn workspace public-pages build`
      2. Merge public pages output into the SPA dist (or serve alongside)
      3. Update `caddy/prod/Caddyfile` to serve `.html` pages for clean URLs
         (e.g. `/about` → `about.html`) and use `not-found.html` as the error
         page instead of falling back to the SPA's `index.html` for all routes
