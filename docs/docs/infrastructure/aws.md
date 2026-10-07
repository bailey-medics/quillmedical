# Amazon Web Services

Quill uses AWS for one thing: sending email, through Amazon SES in London
(`eu-west-2`). Everything else runs on Google Cloud. Why SES, and how it
was set up, is in the
[Amazon SES email plan](../plans/2026-10-06-amazon-ses-email-plan.md).

## The accounts

One organisation, with four accounts. Their numbers are kept out of this
repository, which is public; they are in `backend/.env`.

- **Quill Medical Superadmin** – the management account: policies and
  new accounts. Nothing runs in it.
- **Quill Medical ID** – the sign-in directory.
- **Quill Medical Emails App** – SES for App production.
- **Quill Medical Emails Dev** – SES for development, in the sandbox, so
  it can write only to addresses verified in the account.

A policy on the organisation allows London only, with the two American
regions AWS's own global services need.

## What is in each email account

Described in Terraform, in `infra/aws/`, one module used twice:

- **The domain** – `quill-medical.com`, verified, signing with Easy DKIM.
  Amazon holds the keys; the three selectors are CNAME records in
  `infra/dns.tf`.
- **The MAIL FROM name** – `mail.quill-medical.com`, where bounces come
  back, so SPF lines up with the domain.
- **The suppression list** – Amazon refuses an address that hard-bounced
  or whose owner pressed "spam". Quill reads the list before each
  newsletter send.
- **One user** – `quill-backend-ses` (`quill-backend-ses-dev` in
  development), whose access key the backend sends with. Its policy
  allows sending, from London, and nothing else; App production's may
  also read the suppression list.

The access keys are not in Terraform. A key Terraform makes is written
into its state in plain text, so each is made by hand and put straight
into GCP Secret Manager (`ses-access-key-id`, `ses-secret-access-key`)
or, for development, `backend/.env`.

## Changing it

A person applies `infra/aws/`, never CI. A pull request gets formatting
and validation; a merge posts a reminder to Slack. Then, from a checkout
up to date with `main`:

```bash
just al               # sign in to the emails account
just al management    # and the management one, which reaches development
just terraform-aws    # plan, ask, apply
```

CI holds nothing for AWS. Applying needs a role able to write IAM
policy, which could widen what the mail key may do, so that stays with
somebody signed in.
