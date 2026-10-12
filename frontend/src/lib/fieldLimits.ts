/**
 * The most characters the backend takes in the fields that matter most.
 *
 * These match `backend/app/schemas/limits.py`, which is where they are
 * enforced: a value over the limit is refused there with a 422. Setting
 * the same number on the input means nobody can type past it, so they
 * are stopped at the field and not after pressing save. Change one and
 * change the other.
 */

/** A username. `users.username` is 150 characters wide. */
export const MAX_USERNAME = 150;

/** A person's full name. */
export const MAX_FULL_NAME = 255;

/** An email address. */
export const MAX_EMAIL = 255;

/** A password. Far longer than any passphrase. */
export const MAX_PASSWORD = 128;

/**
 * A one-time code. Six digits, with room for the spaces some
 * authenticator apps show between them.
 */
export const MAX_TOTP_CODE = 16;
