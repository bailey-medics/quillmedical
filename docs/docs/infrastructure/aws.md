# Amazon Web Services

Quill uses AWS for one thing: sending email, through Amazon SES in London
(`eu-west-2`). Everything else runs on Google Cloud. Why SES, and how it
was set up, is in the
[Amazon SES email plan](../plans/2026-10-06-amazon-ses-email-plan.md).

## The accounts

One organisation, with four accounts. Their numbers are kept out of this
repository, which is public; they are in `backend/.env`.

- **Quill Medical Superadmin** - the management account: policies and
  new accounts. Nothing runs in it.
- **Quill Medical ID** - the sign-in directory.
- **Quill Medical Emails App** - SES for App production.
- **Quill Medical Emails Dev** - SES for development, in the sandbox, so
  it can write only to addresses verified in the account.

A policy on the organisation allows London only, with the two American
regions AWS's own global services need. It applies to every account,
whatever a user or key in it is allowed.

The organisation, the four accounts and that policy are in Terraform, in
`infra/aws/organisation.tf`, and Terraform will not delete any of them.
A plan warns if the organisation holds an account the code does not
list. To add one: make it in the console, put its number in
`backend/.env`, and add it to `organisation.tf`.

What AWS manages itself is not in Terraform: sign-in, which runs through
an Identity Center AWS owns, and the policies and roles AWS keeps on the
organisation for its own purposes.

## What is in each email account

Described in Terraform, in `infra/aws/`, one module used twice:

- **The domain** - `quill-medical.com`, verified, signing with Easy DKIM.
  Amazon holds the keys; the three selectors are CNAME records in
  `infra/dns.tf`.
- **The MAIL FROM name** - `mail.quill-medical.com`, where bounces come
  back, so SPF lines up with the domain.
- **The suppression list** - Amazon refuses an address that hard-bounced
  or whose owner pressed "spam". Quill reads the list before each
  newsletter send.
- **One user** - `quill-backend-ses` (`quill-backend-ses-dev` in
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
just terraform-aws    # sign in where needed, plan, ask, apply, sign out
```

The sign-ins can do anything in their accounts, so a machine keeps them
only while a job needs them. `just terraform-aws` signs out of both,
and of Google Cloud, when it ends, however it ends. A sign-in made with `just aws-login` for
other work signs itself out after an hour, and `just aws-logout` signs
out at once.

CI holds nothing for AWS. Applying needs a role able to write IAM
policy, which could widen what the mail key may do, so that stays with
somebody signed in.

## Building it again

The SES set-up in each email account was first made by hand in the
console, then adopted into Terraform with `import` blocks. Those blocks
were deleted once applied, because an import of something that does
not exist fails. `git log -- infra/aws/imports.tf` shows what they
adopted.

So `infra/aws/` creates every SES resource itself. To build it in empty
email accounts:

1. Put the new account numbers in `backend/.env`
   (`AWS_EMAILS_ACCOUNT_ID`, `AWS_EMAILS_DEV_ACCOUNT_ID`).
   `just terraform-aws` reads them from there.
2. Run `just terraform-aws`. It signs in to both AWS accounts first. This
   makes the domain identity, the MAIL FROM name, the suppression list
   settings and the user with its policy.
3. Copy the new `dkim_tokens` outputs into the CNAME records in
   `infra/dns.tf`, and apply that. SES verifies the domain once the
   records resolve.
4. Make an access key for each user in the console, and put it in GCP
   Secret Manager (`ses-access-key-id`, `ses-secret-access-key`) or, for
   development, `backend/.env`.
5. Ask AWS, through a support case in the console, to move the App
   production account out of the SES sandbox. Terraform cannot do this.

Lesson for next time: write the Terraform first and let it create a
resource. Only what Terraform cannot do, such as the sandbox request or
the access keys, is done by hand.
