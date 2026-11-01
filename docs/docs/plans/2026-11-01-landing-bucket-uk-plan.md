# Landing bucket UK plan

Everything in App production lives in `europe-west2` (London) except the
public site's bucket, `quill-medical-app-landing`, which is in the `EU`
multi-region and so may hold its files in any of several EU countries. The
site holds no patient data, so this is not a compliance gap, but it is the
one exception to "all of Quill is in the UK", and the
[disaster recovery plan](2026-09-17-disaster-recovery-plan.md) has to note
it as one. Checked with `gcloud storage buckets list --project
quill-medical-app` on 1 November 2026.

A bucket's location is fixed when it is made, so the bucket cannot be moved,
only replaced. Changing `location = "EU"` in place would make Terraform
delete the bucket and create it again under the same name, and with
`force_destroy = true` the site would serve 404s until the next deploy
refilled it. The outcome instead is a second bucket in `europe-west2`,
filled while the old one still serves, then swapped in behind the load
balancer, with no downtime.

## Phase 1: Make the London bucket and fill it

- [x] Add a second bucket beside `google_storage_bucket.landing` in `infra/modules/load-balancer/main.tf`, named `${var.project_id}-landing-uk`, with `location = "europe-west2"` and the same `website`, `uniform_bucket_level_access` and `force_destroy` settings, plus a matching `allUsers` `roles/storage.objectViewer` binding like `landing_public`. Keep the same `count` on `var.landing_domain`, so only `app` gets one. It needs a new name because bucket names are global: the old one keeps its name until it is deleted. Leave `google_compute_backend_bucket.landing` pointing at the old bucket.

- [x] Make `.github/scripts/public-site/deploy-to-gcs.sh` sync to both `${project_id}-landing` and `${project_id}-landing-uk`, so the new bucket receives the same files with the same `Cache-Control` metadata the script sets, rather than a one-off copy that would lose it. Point `list-files.sh` at the new bucket. Both scripts' header comments say "teaching project", which is stale: the landing site is in the app project, so correct that while there.

- [x] Merge as one pull request. `terraform.yml` applies on the merge and `public-site.yml` deploys on it too, since `.github/scripts/public-site/**` is in its paths, and the two run at the same time. If the deploy reaches the new bucket before Terraform has made it, it fails; once the apply is green, re-run "Deploy public site" with `workflow_dispatch`. Check with `gcloud storage ls gs://quill-medical-app-landing-uk` that `index.html` and `assets/` are there. Merged as #2306 on 1 November 2026. The race did not happen: the apply and the deploy both passed first time, and the deploy log shows both buckets filled. Through the Cloud Storage API the two buckets held the same 99 objects, matching on name, MD5, `Cache-Control` and content type, with `allUsers` as object viewer on the new one.

## Phase 2: Serve from the London bucket

- [x] Change `bucket_name` on `google_compute_backend_bucket.landing` to the new bucket, in its own pull request. This is an in-place update of the backend bucket, not a replacement, so the load balancer switches with no gap; confirm the plan in the pull request says `update in-place` and not `must be replaced`. The cached copies at Google's edge are the same files, so no cache invalidation is needed.

- [x] After the apply, check `https://quill-medical.com` and a deep page load, and that the security headers set on the backend bucket are still there (`curl -sI https://quill-medical.com`). Merged as #2307 on 1 November 2026: the apply was 0 added, 2 changed, the second being the usual Cloud Run revision drift, and `quill-landing-app` now names `quill-medical-app-landing-uk`. The home page, `/about`, `/pricing`, `/privacy-policy` and `www` returned 200, a missing page returned the bucket's `not-found.html` as a 404, and all six security headers were present. The check also found that the hashed JS reaches browsers with `max-age=3600` rather than a year, which Phase 4 fixes. It was like that before the switch.

## Phase 3: Remove the EU bucket

- [x] Delete `google_storage_bucket.landing` and `landing_public`, and drop the old bucket from `deploy-to-gcs.sh` so it syncs only to `-landing-uk`. The new resources keep the names `landing_uk` and `landing_uk_public`. Renaming them to `landing` with a `moved` block in the same apply is not possible: Terraform refuses to move an object onto an address that still has one in state, and the old `landing` is only destroyed by that apply. A rename later would be a fourth pull request for a name only Terraform reads. With `force_destroy = true` the apply empties and deletes the old bucket; it holds nothing that the deploy cannot rebuild.

- [x] Update the bucket name in `docs/docs/frontend/public-pages.md` (the `{project}-landing` line in the deploy section), and in the disaster recovery plan's object storage section, which says the landing site is the one bucket in the `EU` multi-region. The comments naming the bucket in `public-site.yml` and the app `terraform.tfvars` were updated too. After the apply, check with `gcloud storage buckets list --project quill-medical-app` that every bucket now reads `EUROPE-WEST2`.

## Phase 4: Let the CDN keep the deploy's cache headers

- [x] Add `cdn_policy { cache_mode = "USE_ORIGIN_HEADERS" }` to `google_compute_backend_bucket.landing` in `infra/modules/load-balancer/main.tf`, in its own pull request after Phase 3. The backend bucket has no `cdn_policy` today, so Cloud CDN uses its defaults: `CACHE_ALL_STATIC`, a `clientTtl` of 3600 and a `maxTtl` of 86400 (read with `gcloud compute backend-buckets describe quill-landing-app` on 1 November 2026). In that mode the CDN cuts the `max-age` it sends browsers down to `clientTtl`, so the year-long `immutable` header `deploy-to-gcs.sh` sets on hashed assets arrives as `max-age=3600`. A returning visitor's browser then checks each script again every hour, and Lighthouse reports an inefficient cache policy. `USE_ORIGIN_HEADERS` makes the CDN obey each object's own `Cache-Control`, so the deploy script is the one place cache lifetimes are decided: a year for hashed assets, a day for email images, 30 days for other static files and `no-cache` for HTML. The other way, staying on `CACHE_ALL_STATIC` with `client_ttl` and `max_ttl` raised to a year, was turned down because it leaves two places deciding lifetimes that can drift apart. In this mode the CDN does not cache a response with no `Cache-Control`, which is safe here because the deploy gives every object one; all 99 had one on 1 November 2026. `client_ttl`, `default_ttl` and `max_ttl` must not be set alongside it. Google's gcloud and API references say so for `USE_ORIGIN_HEADERS` (checked on 1 November 2026). No report was found of the Terraform provider sending the old values from state when the mode changes, but that is the thing to look for in the pull request's plan: if it fails, the apply changes nothing and the site keeps serving. `docs/docs/frontend/public-pages.md` now says which mode the CDN uses.

- [ ] Confirm the Terraform plan on the pull request says `update in-place` for `google_compute_backend_bucket.landing`. After the apply, check that a hashed file under `/assets/` comes back with `max-age=31536000, immutable`, that the home page still comes back `no-cache`, and that the security headers are unchanged (`curl -sI`). Say in the comment above the backend bucket why `cache_mode` is set, so it is not tidied away as a default.

## Decisions

- **Three pull requests for the move, not one** - one change of `location` is a single line, but it takes the site down. Splitting fill, switch and remove means each apply leaves a working site, and a failure at any step leaves the old bucket still serving.

- **The new name stays `-landing-uk`** - getting back to plain `-landing` would mean a fourth move, through another bucket, for a name nobody sees. The workflow and the scripts are the only things that use it.
