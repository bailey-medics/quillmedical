"""The most characters a request may put in the fields that matter most.

Every request body is capped as a whole by `app.body_limit`, which is
what stops a megabyte of free text. These are the fields where a much
smaller limit is the honest one: a name that has a column to fit, a
password that is hashed, a token of a known size. A value over the
limit is refused with a 422 naming the field, before any rule runs.

One place, so the same field has the same limit wherever it is asked
for, and the frontend's forms have one list to match.
"""

#: `users.username` is 150 characters wide.
MAX_USERNAME = 150

#: `users.full_name` is 255 characters wide.
MAX_FULL_NAME = 255

#: `users.email` is 255 characters wide. An address may not be longer
#: than 254 in any case.
MAX_EMAIL = 255

#: Far longer than any passphrase, and short enough that hashing it
#: costs nothing worth noticing. A password is never cut short to fit:
#: one over the limit is refused.
MAX_PASSWORD = 128

#: A signed token from a link in an email. The longest issued here is a
#: few hundred characters.
MAX_TOKEN = 2048

#: Six digits, with room for the spaces some authenticator apps show.
MAX_TOTP_CODE = 16
