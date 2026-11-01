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

- [ ] Merge as one pull request. `terraform.yml` applies on the merge and `public-site.yml` deploys on it too, since `.github/scripts/public-site/**` is in its paths, and the two run at the same time. If the deploy reaches the new bucket before Terraform has made it, it fails; once the apply is green, re-run "Deploy public site" with `workflow_dispatch`. Check with `gcloud storage ls gs://quill-medical-app-landing-uk` that `index.html` and `assets/` are there.

## Phase 2: Serve from the London bucket

- [x] Change `bucket_name` on `google_compute_backend_bucket.landing` to the new bucket, in its own pull request. This is an in-place update of the backend bucket, not a replacement, so the load balancer switches with no gap; confirm the plan in the pull request says `update in-place` and not `must be replaced`. The cached copies at Google's edge are the same files, so no cache invalidation is needed.

- [ ] After the apply, check `https://quill-medical.com` and a deep page load, and that the security headers set on the backend bucket are still there (`curl -sI https://quill-medical.com`).

## Phase 3: Remove the EU bucket

- [x] Delete `google_storage_bucket.landing` and `landing_public`, and drop the old bucket from `deploy-to-gcs.sh` so it syncs only to `-landing-uk`. The new resources keep the names `landing_uk` and `landing_uk_public`. Renaming them to `landing` with a `moved` block in the same apply is not possible: Terraform refuses to move an object onto an address that still has one in state, and the old `landing` is only destroyed by that apply. A rename later would be a fourth pull request for a name only Terraform reads. With `force_destroy = true` the apply empties and deletes the old bucket; it holds nothing that the deploy cannot rebuild.

- [x] Update the bucket name in `docs/docs/frontend/public-pages.md` (the `{project}-landing` line in the deploy section), and in the disaster recovery plan's object storage section, which says the landing site is the one bucket in the `EU` multi-region. The comments naming the bucket in `public-site.yml` and the app `terraform.tfvars` were updated too. After the apply, check with `gcloud storage buckets list --project quill-medical-app` that every bucket now reads `EUROPE-WEST2`.

## Decisions

- **Three pull requests, not one** - one change of `location` is a single line, but it takes the site down. Splitting fill, switch and remove means each apply leaves a working site, and a failure at any step leaves the old bucket still serving.

- **The new name stays `-landing-uk`** - getting back to plain `-landing` would mean a fourth move, through another bucket, for a name nobody sees. The workflow and the scripts are the only things that use it.
