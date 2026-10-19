# Direct VPC egress plan

<!-- cspell:ignore 68rdt cs745 rhbnw rzdwb trs5t wqsfp -->

Every Cloud Run workload that reaches the private network does so through
a Serverless VPC Access connector: two or three `e2-micro` relay machines
that run all day and carry every byte at about 200 Mbps each. Since the
job callbacks plan moved the transcode and caption jobs to `ALL_TRAFFIC`
egress, their video reads and writes go through those relays too, where
before they bypassed them, so a two gigabyte lecture master now takes
over a minute to pull and the renditions as long to push back. Google's
newer Direct VPC egress gives each container its own address on the
subnet instead: no relay, the container's own throughput (up to 1 Gbps
an instance), and nothing running when nothing is running.

The outcome is every workload on Direct VPC egress, the connector
deleted, and the video jobs moving at their own speed. All five move,
not just the two jobs, because two egress mechanisms in one project are
two sets of failure modes to understand when a packet goes astray. The
units stack on the `security` stack, above #2095, so `just stack-watch`
keeps the whole series in one view.

## Phase 1: A subnet for Cloud Run

- [x] Add `google_compute_subnetwork.cloud_run` to
      `infra/modules/networking/main.tf`, named `quill-run-<env>`, with
      `private_ip_google_access = true` so GCS and the backend's
      `run.app` address stay on Google's network, and an output for its
      id. Google requires a `/26` at least and reserves addresses in
      blocks of sixteen; a service holds twice its instance count at
      steady state and keeps its addresses for twenty minutes after
      scaling down, and each job task holds one for its run plus seven
      minutes. With `cloud_run_max_instances = 5` for the backend, four
      jobs, and revision rollouts doubling a service's count for a
      while, a `/24` (256 addresses) is roomy and costs nothing. Pick
      `10.9.0.0/24` unless it collides: the private subnet is
      `10.0.0.0/20`, the connector `10.8.0.0/28`, and the Cloud SQL
      peering range is a `/16` Google chose, so read it with
      `gcloud compute addresses describe quill-private-ip-app --global`
      before settling, and record the range chosen here. Read on
      2026-10-18: the peering range is `10.185.0.0/16`, and the only
      subnet on `quill-vpc-app` is the private one, so `10.9.0.0/24`
      it is, as `quill-run-app`. Nothing in
      Cloud NAT changes: `source_subnetwork_ip_ranges_to_nat` is already
      `ALL_SUBNETWORKS_ALL_IP_RANGES`, and `endpoint_types` defaults to
      `ENDPOINT_TYPE_VM`, which is what Direct VPC needs. Lands alone,
      before anything refers to it. Sources:
      [Direct VPC egress](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc),
      [Cloud NAT and Cloud Run](https://docs.cloud.google.com/nat/docs/nat-product-interactions).

## Phase 2: The modules learn Direct VPC

- [x] Give `infra/modules/cloud-run-job` and `infra/modules/cloud-run` a
      `vpc_subnetwork_id` variable beside `vpc_connector_id`, defaulting
      to empty, with a validation that at most one is set. When the
      subnet is given, the `vpc_access` block carries
      `network_interfaces { network, subnetwork }` and the egress
      setting instead of `connector`; the two are exclusive on a
      revision. Only `subnetwork` is given: the API looks the network
      up from it, per the
      [NetworkInterface reference](https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Run.V2/latest/Google.Cloud.Run.V2.VpcAccess.Types.NetworkInterface).
      No network tags for now: Direct VPC instances can carry
      them, but the only firewall rule that would read one does not
      exist yet, and an ingress rule cannot use a tag anyway, only the
      subnet's range. The job module's `vpc_egress` description, which
      still says "through the VPC connector", is rewritten to say
      "through the VPC". No workload changes in this unit: the modules
      accept both and every caller still passes the connector.

## Phase 3: The transcode and caption jobs move

- [x] Pass `vpc_subnetwork_id` instead of `vpc_connector_id` to
      `module "cloud_run_transcode_job"` and `module "cloud_run_caption_job"`
      in `infra/main.tf`, keeping `ALL_TRAFFIC`: their reports must
      still arrive at the backend as internal traffic, and the caption
      job fetches the Whisper model from the internet on each run,
      which goes out through Cloud NAT as it does today. Rewrite the
      comment on each that explains the egress in terms of the
      connector. These two first because nothing is serving on them:
      a job that cannot reach the network fails one execution, visibly,
      and nothing else notices.

- [x] Run one transcode and one caption job in App production after the
      apply, and confirm both reports land and the encode is faster
      than the last one on the connector. Done on 2026-10-18 once
      Phases 1 to 4 had applied: transcode `quill-transcode-app-rzdwb`
      on `936b61864b6b41a1b4ddb807f20c6240`, 4 min 03 s against 3 min
      53 s for the same asset's original run (which bypassed the
      connector altogether, before the callbacks plan) and 4 min 17 s on
      the connector; the download and the three uploads each took under
      a second, so the encode itself is the time. Caption
      `quill-caption-app-cs745`, 1 min 20 s. Both reports answered 200,
      and the execution records show `network-interfaces` and no
      connector. Google warns an instance may
      wait a minute for its first connection on Direct VPC, which is
      lost in a twenty-minute job timeout. The figure to beat, from
      2026-10-18 on the connector: asset
      `81d2b3821b6b4ddaaa6adf48c61cfd99` took 4 min 17 s start to finish
      (execution `quill-transcode-app-trs5t`).

## Phase 4: The admin and teaching-sync jobs move

- [x] The same change for `module "cloud_run_admin_job"` and
      `module "cloud_run_teaching_sync_job"`. The admin job keeps
      `ALL_TRAFFIC`: the deploy's smoke test reaches a tagged revision's
      `run.app` address, which must arrive as internal traffic, and
      `send-newsletter` reaches SES through Cloud NAT. The sync job
      reads the teaching bucket through Private Google Access and
      needs nothing else.

- [x] Confirm with one ordinary deploy, which runs the migrations and
      the smoke test on the admin job, and one
      `gcloud run jobs execute quill-teaching-sync-app --wait`, or a
      pipeline run if the sync plan has landed by then. Done on
      2026-10-18: the deploy that merged Phases 1 to 4 ran its smoke
      test before the apply had moved the admin job, but the admin
      job's scheduled `finish-exams-out-of-time` at 20:55 ran on Direct
      VPC and reached Cloud SQL, and the hand-run `deploy.yml` after
      #2105 (run 39168326385) ran `run-migrations` (`quill-admin-app-68rdt`)
      and `smoke-test` (`quill-admin-app-rhbnw`) on Direct VPC, both
      green. The sync job is not run here: its pipeline step is the
      sync plan's Phase 3, and it reaches the same Cloud SQL and bucket
      the admin job just did.

## Phase 5: The backend moves

- [x] Pass `vpc_subnetwork_id` to `module "cloud_run_backend"`, keeping
      the module's `PRIVATE_RANGES_ONLY`: the backend reaches Cloud SQL
      on its private address and, in EHR production, the FHIR machine,
      and its public calls (SES, Google's signing certificates) leave
      directly and never touch Cloud NAT. That matters because Google
      warns that Cloud NAT with Direct VPC can add thirty seconds or
      more to a cold start; a workload that never uses NAT does not pay
      it. The startup probe already tests egress, not just boot:
      `/api/health` opens the core database, and the probe allows
      seventy seconds (ten initial, six tries ten apart), which covers
      the minute Google says the first connection may take. The
      frontend reaches nothing private and has no VPC access today; it
      gets none now either.

- [x] A Terraform apply makes a new revision that serves no traffic, so
      re-run `deploy.yml` afterwards and confirm the serving revision is
      the new one (`gcloud run services describe quill-backend-app`
      shows it). Exactly so on 2026-10-18: Terraform's revision
      `00236-r98` carried the subnet and no traffic, the merge's deploy
      skipped both builds as no code had changed, and a hand-run
      `deploy.yml` put `00425-liw` into service on Direct VPC at 21:39. Then watch the first request after an idle spell: the
      backend has no minimum instances, so every cold start now
      includes Direct VPC's network set-up. Nobody is on App production
      yet, so this is measured rather than pre-empted; if a cold start
      is felt, `min_instances = 1` on the backend is the one-line
      answer, and is recorded here if taken. Measured on 2026-10-18 from
      revision `00425-liw`'s first instance: started 21:39:50, Uvicorn
      up at 21:39:52, workers ready at 21:40:05, startup probe (which
      opens Cloud SQL over the new subnet) passed at 21:40:11 on its
      second attempt. About 21 seconds, of which the app's own boot is
      most, and the first `/api/health` through the load balancer took
      4 ms. No sign of the minute-long first connection Google warns
      of, so `min_instances` stays unset.

## Phase 6: The connector goes

- [x] Only once Phase 5 is live and serving: delete
      `google_vpc_access_connector.connector` from the networking module,
      its `vpc_connector_id` output (and the root one in
      `infra/outputs.tf`), and the `vpc_connector_id` variable and its
      branch from both Cloud Run modules, so the modules know Direct VPC
      alone. Its own unit, after the workloads have moved, so Terraform
      never tries to delete a connector a live revision still names.
      Built on 2026-10-18 as the unit above the backend's move; **its
      pull request must not merge until #2105 is live and a deploy has
      passed on it**, which is written in that pull request. Of the
      three "VPC connector" mentions in `docs/docs/infrastructure/gcp.md`
      only the module table changed; the other two are the record of
      the first applies and stay as history. The comments in
      `infra/main.tf` that name the connector do so as history too and
      stay. The `10.8.0.0/28` range is freed with it; the new subnet
      stays.

- [x] Confirm the apply deleted the connector and nothing else, and that
      a deploy and one transcode still pass afterwards. Done on
      2026-10-19: #2116's apply reported "0 added, 1 changed, 1
      destroyed", the destroyed one `google_vpc_access_connector.connector`
      (4 min 15 s to go), and the connector list is empty. Transcode
      `quill-transcode-app-wqsfp` on `959bd5375d544d528c9b984d5efa9dfc`
      ran afterwards, 4 min 11 s, and its report was answered 200. The
      deploy that proved the backend on Direct VPC was the hand-run one
      the day before; the connector's removal changes nothing a deploy
      touches.

## Decisions

- **All five workloads, not the two jobs** - the throughput gain is the
  jobs' alone, but two egress paths in one project means two subnets,
  two NAT behaviours and two answers to "which way did this packet go".
  Moving everything is more work once and less to understand forever.

- **Jobs first, backend last, connector deletion on its own** - a job
  that loses its network fails one execution and nothing else; the
  backend losing it is an outage, so it moves once the pattern has been
  seen working four times. The connector is deleted only when no
  revision names it, so an apply cannot pull it from under a live one.

- **No minimum instances pre-emptively** - Direct VPC can slow a cold
  start, but the backend never uses NAT, its probe already waits for
  egress, and nobody is on App production yet. Measuring first costs
  nothing; a standing instance costs money every month.

- **Cloud NAT left as it is** - it already covers every subnet, and its
  endpoint type is the one Direct VPC needs. Google's advice to double
  `min_ports_per_vm` is for workloads that open many outbound
  connections at once; a newsletter send and a model download are not
  that, and the default 64 is left until a NAT port-exhaustion log says
  otherwise.
