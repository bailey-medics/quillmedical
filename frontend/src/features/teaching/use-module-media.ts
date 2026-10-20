/**
 * The admin card's data and actions for one module's videos.
 *
 * Upload is three steps, not one: ask the backend for a resumable URL,
 * send the bytes straight to GCS, then tell the backend what landed.
 * The middle step deliberately does not go through our API - a lecture
 * is hundreds of megabytes and routing it through Cloud Run would pay
 * for the transfer twice and hold a request open throughout.
 *
 * That is also why the backend never sees the file: it mints a URL and
 * records the result, and the bytes go straight past it.
 */

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { csrfHeader } from "@lib/csrf";
import {
  UploadFailure,
  uploadResumable,
} from "@/features/teaching/resumable-upload";
import type {
  Captions,
  MediaUploadUrl,
  ModuleMedia,
} from "@/features/teaching/types";

export interface ModuleMediaState {
  media: ModuleMedia | null;
  loading: boolean;
  error: string | null;
  /** Percent complete per reference key, while an upload is in flight. */
  uploadProgress: Record<string, number>;
  /**
   * Name of the file being uploaded, per reference key.
   *
   * Taken from the dropped file rather than the asset, which does not
   * exist until the upload finishes and the link is recorded. Without
   * it the row can only say that something is on its way, not what.
   */
  uploadNames: Record<string, string>;
  /**
   * Whether any file is still on its way to the bucket.
   *
   * Derived from `uploadProgress` rather than tracked separately, so
   * there is one record of what is in flight and no second flag to be
   * left set when an upload fails.
   *
   * The page guards navigation on this. The bytes go straight to GCS
   * from an `XMLHttpRequest` held in a closure, so a full page load
   * kills the transfer part-way and the `link` call that records the
   * asset never runs - the object is left in the bucket with nothing
   * pointing at it, and the admin sees an empty row.
   */
  uploading: boolean;
  /**
   * Why the last upload against a reference key failed, if it did.
   *
   * Per key rather than one message for the card, so the row that
   * failed is the row that says so. Cleared when that key is tried
   * again, which is what makes the retry a clean slate rather than a
   * second attempt haunted by the first one's message.
   */
  uploadErrors: Record<string, string>;
  /**
   * Reference keys whose upload lost its connection and is waiting to
   * try again.
   *
   * Without it the bar simply stops, which looks the same as a hung
   * page. Cleared as soon as GCS accepts bytes again, and when the
   * upload ends either way.
   */
  uploadRetrying: Record<string, boolean>;
  upload: (key: string, file: File) => Promise<void>;
  remove: (assetId: string) => Promise<void>;
  /**
   * Fetch one asset's WebVTT, or null if it could not be read.
   *
   * On demand rather than with the media list: a WebVTT is a whole
   * lecture transcript, and loading one per row would cost several
   * requests to render a card whose captions are usually not being
   * looked at.
   */
  loadCaptions: (assetId: string) => Promise<Captions | null>;
  /** Replace one asset's WebVTT. True when it saved. */
  saveCaptions: (assetId: string, webvtt: string) => Promise<boolean>;
  /**
   * Choose the second one asset's poster is taken from. True when the
   * choice saved; the poster itself is retaken in the background.
   */
  savePosterFrame: (assetId: string, seconds: number) => Promise<boolean>;
}

/**
 * The largest video an administrator may upload: 3 GiB.
 *
 * The same limit as `MAX_MEDIA_UPLOAD_BYTES` in the backend, which
 * refuses anything larger. Checked here as well so the admin hears it
 * at once, rather than after asking for somewhere to upload to.
 */
export const MAX_VIDEO_UPLOAD_BYTES = 3 * 1024 * 1024 * 1024;

/** Round a byte count to something a person reads at a glance. */
function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

/**
 * Say what actually went wrong, not merely that something did.
 *
 * A bare status code makes the admin guess, and the guess for a video
 * is usually wrong - "too large" and "wrong format" look identical as
 * a number. Each case here names the fault and, where the admin can
 * act on it, what to do instead.
 */
function describeUploadFailure(status: number, file: File): string {
  if (status === 413) {
    return `This file is too large to upload (${formatSize(file.size)}). The limit is ${formatSize(MAX_VIDEO_UPLOAD_BYTES)}: try a shorter recording or a more compressed export.`;
  }
  if (status === 415 || status === 400) {
    return `This file type cannot be uploaded (${file.type || "unknown type"}). Videos must be MP4, WebM or QuickTime.`;
  }
  if (status === 401 || status === 403) {
    return "You do not have permission to upload here, or your session has expired. Try reloading the page.";
  }
  if (status === 404) {
    return "This module no longer exists, so the upload had nowhere to go.";
  }
  if (status >= 500) {
    return `The server could not accept the upload (${status}). This is not a problem with your file - try again shortly.`;
  }
  return `Upload failed (${status}). Try again.`;
}

/**
 * What a dropped connection says.
 *
 * The commonest way an upload fails is the computer going to sleep or
 * the network dropping, and a bare "Upload failed" gave no hint of
 * either. This names the cause and the two things that prevent it.
 */
const CONNECTION_LOST =
  "The connection was lost during the upload. Keep this tab open and the computer awake, then try again.";

/**
 * Open a resumable upload session and return the URL to send bytes to.
 *
 * The signed URL the backend mints is for `POST` with an
 * `x-goog-resumable: start` header - that is what *begins* a resumable
 * upload rather than performing one. GCS answers with a session URL in
 * the `Location` header, and the bytes go there.
 *
 * The signature covers the method and those headers, so sending
 * anything else is rejected as a mismatch. A plain `PUT` to this URL
 * fails, which is exactly how this was broken.
 */
function startResumableUpload(url: string, file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.setRequestHeader("x-goog-resumable", "start");
    request.setRequestHeader("Content-Type", file.type);

    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(describeUploadFailure(request.status, file)));
        return;
      }
      const session = request.getResponseHeader("Location");
      if (!session) {
        // The bucket's CORS policy has to expose Location, or the
        // browser hides it and the upload has nowhere to go.
        reject(
          new Error(
            "Storage did not open an upload session. Try again, and if it happens again the storage settings need checking.",
          ),
        );
        return;
      }
      resolve(session);
    });
    request.addEventListener("error", () => reject(new Error(CONNECTION_LOST)));

    request.send();
  });
}

/**
 * Send the whole file in one request, reporting progress as it goes.
 *
 * Only the local development route takes a file this way. GCS gets it
 * in chunks, through `uploadResumable`.
 */
function sendToSession(
  sessionUrl: string,
  file: File,
  onProgress: (percent: number) => void,
  headers: Record<string, string> = {},
): Promise<void> {
  // XMLHttpRequest rather than fetch: fetch cannot report upload
  // progress, and on a file this size a bar is not decoration.
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", sessionUrl);
    request.setRequestHeader("Content-Type", file.type);

    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new Error(describeUploadFailure(request.status, file)));
      }
    });
    request.addEventListener("error", () => reject(new Error(CONNECTION_LOST)));
    request.addEventListener("abort", () =>
      reject(new Error("Upload cancelled")),
    );

    request.send(file);
  });
}

/**
 * Say why a resumable upload stopped.
 *
 * A refusal has a status, and is described like any other. The other
 * two have none worth showing.
 */
function describeStoppedUpload(failure: UploadFailure, file: File): string {
  if (failure.kind === "session-gone") {
    return "The upload took too long and Google closed it. Try again.";
  }
  if (failure.kind === "refused" && failure.status !== null) {
    return describeUploadFailure(failure.status, file);
  }
  return CONNECTION_LOST;
}

/**
 * Send one file to GCS.
 *
 * Two steps, not one. A local development URL is not a GCS resumable
 * URL, so it takes the single PUT it expects instead - the backend
 * decides which by whether it handed back an absolute URL.
 *
 * To GCS the file goes in chunks, so a dropped connection costs one
 * chunk rather than the whole upload: see `resumable-upload.ts`.
 */
async function putToBucket(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
  onRetrying: (retrying: boolean) => void,
): Promise<void> {
  // A relative URL is the local route, which receives the body
  // directly. Only GCS speaks the resumable handshake.
  //
  // That route is ours and changes something, so it checks the CSRF
  // token like any other. `api` would add it, but this request cannot
  // go through `api`. The token is never sent to GCS: a signed URL is
  // its own permission, and an unexpected header breaks the signature.
  if (!/^https?:\/\//.test(url)) {
    return sendToSession(url, file, onProgress, csrfHeader());
  }

  const session = await startResumableUpload(url, file);

  try {
    await uploadResumable(session, file, { onProgress, onRetrying });
  } catch (err) {
    if (err instanceof UploadFailure) {
      throw new Error(describeStoppedUpload(err, file), { cause: err });
    }
    throw err;
  }
}

/**
 * How often to re-ask while a job is running.
 *
 * Ten seconds: a transcode takes minutes and captions longer, so this
 * is far finer than the work it watches, and the request is one small
 * read of rows the page already holds.
 *
 * Overridable so a test can prove the polling without waiting ten real
 * seconds. Swapping the clock for fake timers was tried first and
 * proved unreliable - the interval is registered inside an effect that
 * runs after an awaited fetch, and the two did not line up.
 */
export const MEDIA_POLL_INTERVAL_MS = 10_000;

/**
 * One module's videos for one organisation running it.
 *
 * A video is stored once for each organisation running the module, so
 * the module's admin page holds one of these for each. Without an
 * organisation, the caller's own, as the routes have always taken it.
 */
export function useModuleMedia(
  moduleId: string | null,
  pollIntervalMs: number = MEDIA_POLL_INTERVAL_MS,
  orgUnitId: number | null = null,
): ModuleMediaState {
  // The organisation, added to every address below, or nothing.
  const scope = orgUnitId === null ? "" : `?org_unit_id=${orgUnitId}`;
  const [media, setMedia] = useState<ModuleMedia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {},
  );
  const [uploadNames, setUploadNames] = useState<Record<string, string>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [uploadRetrying, setUploadRetrying] = useState<Record<string, boolean>>(
    {},
  );

  const refresh = useCallback(async () => {
    if (!moduleId) return;
    try {
      // Both set after the await, never before: a synchronous setState
      // in an effect costs a second render pass, and this runs from
      // one. Clearing the error alongside the new data says the same
      // thing a moment later.
      const next = await api.get<ModuleMedia>(
        `/teaching/admin/modules/${moduleId}/media${scope}`,
      );
      setMedia(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load media");
    } finally {
      setLoading(false);
    }
  }, [moduleId, scope]);

  useEffect(() => {
    // No module means nothing to fetch. Returning early rather than
    // clearing the loading flag here keeps every state change out of
    // the effect body - a synchronous setState in an effect costs a
    // second render pass, which is what `react-hooks/set-state-in-effect`
    // is there to prevent. The "no module" case is derived on the way
    // out instead.
    if (!moduleId) return;

    // Every setState inside `refresh` runs after an await, so none of
    // them happens synchronously in this effect body and no cascading
    // render occurs. The rule cannot follow state updates across an
    // async boundary, so it flags the call itself. `AdminBankDetailPage`
    // calls `fetchData` from an effect in exactly the same shape and
    // reports the same error on main.
    //
    // The alternative is inlining the fetch here, which would mean a
    // second copy for the post-upload refresh to call - two copies of
    // one request, and the pair that drifts apart later.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [moduleId, refresh, scope]);

  // Whether bytes are still going to the bucket. Derived from the
  // progress record rather than a flag of its own, so it cannot be
  // left set by an upload that threw - `finally` clears the key either
  // way.
  const uploading = Object.keys(uploadProgress).length > 0;

  // Whether any row is waiting on a job. Derived from what the backend
  // says rather than guessed here: it owns the rules, and a second
  // opinion in the card would be the one that drifts.
  const anyInProgress = Boolean(
    media?.references?.some((ref) => ref.asset?.progress?.in_progress),
  );

  useEffect(() => {
    // Polled only while something is actually running. The card was
    // fetched once and never again, so a progress bar would have sat at
    // the same figure until someone reloaded - which is no better than
    // the "No captions" line it replaces.
    //
    // Stops the moment nothing is in progress, including when a job has
    // stalled: there is no point asking every ten seconds about work
    // that has already failed.
    if (!moduleId || !anyInProgress) return;

    const timer = setInterval(() => {
      void refresh();
    }, pollIntervalMs);

    return () => clearInterval(timer);
  }, [moduleId, anyInProgress, refresh, pollIntervalMs, scope]);

  const upload = useCallback(
    async (key: string, file: File) => {
      if (!moduleId) return;
      setError(null);
      // The previous failure goes before the new attempt starts, so a
      // retry shows its own outcome rather than the last one's.
      setUploadErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });

      // Refused before anything is asked for or sent. The backend
      // refuses it too, but the admin should not wait to hear it.
      if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
        setUploadErrors((e) => ({
          ...e,
          [key]: describeUploadFailure(413, file),
        }));

        return;
      }

      setUploadProgress((p) => ({ ...p, [key]: 0 }));
      setUploadNames((n) => ({ ...n, [key]: file.name }));

      try {
        const grant = await api.post<MediaUploadUrl>(
          `/teaching/admin/modules/${moduleId}/media/upload-url${scope}`,
          {
            media_key: key,
            original_filename: file.name,
            content_type: file.type,
            size_bytes: file.size,
          },
        );

        await putToBucket(
          grant.upload_url,
          file,
          (percent) => setUploadProgress((p) => ({ ...p, [key]: percent })),
          (retrying) =>
            setUploadRetrying((r) => {
              const next = { ...r };
              if (retrying) {
                next[key] = true;
              } else {
                delete next[key];
              }

              return next;
            }),
        );

        // The backend never saw the bytes, so this is what records that
        // they arrived. Until it runs the upload is invisible, and the
        // module stays incomplete.
        await api.post(
          `/teaching/admin/modules/${moduleId}/media/${key}/link${scope}`,
          {
            asset_id: grant.asset_id,
            original_filename: file.name,
            content_type: file.type,
            size_bytes: file.size,
          },
        );

        await refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : CONNECTION_LOST;
        // Recorded against the key only. It used to go on the card as
        // well, which showed the same failure twice under a heading,
        // "Something went wrong", that said less than the row did.
        setUploadErrors((e) => ({ ...e, [key]: message }));
      } finally {
        // Cleared whether it worked or not, so a failed upload returns
        // the row to a dropzone rather than a bar stuck at 60%.
        setUploadProgress((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        });
        setUploadNames((n) => {
          const next = { ...n };
          delete next[key];
          return next;
        });
        setUploadRetrying((r) => {
          const next = { ...r };
          delete next[key];
          return next;
        });
      }
    },
    [moduleId, refresh, scope],
  );

  const remove = useCallback(
    async (assetId: string) => {
      if (!moduleId) return;
      try {
        setError(null);
        await api.del(
          `/teaching/admin/modules/${moduleId}/media/${assetId}${scope}`,
        );
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [moduleId, refresh, scope],
  );

  // Captions are fetched on demand rather than with the media list: a
  // WebVTT is a whole lecture transcript, and loading one per row would
  // cost several requests to render a card whose captions are usually
  // not being looked at.
  const loadCaptions = useCallback(
    async (assetId: string): Promise<Captions | null> => {
      if (!moduleId) return null;
      try {
        setError(null);
        return await api.get<Captions>(
          `/teaching/admin/modules/${moduleId}/media/${assetId}/captions${scope}`,
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load captions",
        );
        return null;
      }
    },
    [moduleId, scope],
  );

  const saveCaptions = useCallback(
    async (assetId: string, webvtt: string): Promise<boolean> => {
      if (!moduleId) return false;
      try {
        setError(null);
        await api.put(
          `/teaching/admin/modules/${moduleId}/media/${assetId}/captions${scope}`,
          { webvtt },
        );
        // Saving records the review, so the card's badge is stale until
        // the media list is fetched again.
        await refresh();
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save captions",
        );
        return false;
      }
    },
    [moduleId, refresh, scope],
  );

  const savePosterFrame = useCallback(
    async (assetId: string, seconds: number): Promise<boolean> => {
      if (!moduleId) return false;

      try {
        setError(null);
        await api.put(
          `/teaching/admin/modules/${moduleId}/media/${assetId}/poster-frame${scope}`,
          { seconds },
        );
        // The card shows which second is in use, so it is stale until
        // the media list is fetched again.
        await refresh();

        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save the poster",
        );

        return false;
      }
    },
    [moduleId, refresh, scope],
  );

  // Derived rather than stored, so a null module reports "nothing to
  // load" immediately without an extra render.
  if (!moduleId) {
    return {
      media: null,
      loading: false,
      error: null,
      uploadProgress: {},
      uploadNames: {},
      uploading: false,
      uploadErrors: {},
      uploadRetrying: {},
      upload,
      remove,
      loadCaptions,
      saveCaptions,
      savePosterFrame,
    };
  }

  return {
    media,
    loading,
    error,
    uploadProgress,
    uploadNames,
    uploading,
    uploadErrors,
    uploadRetrying,
    upload,
    remove,
    loadCaptions,
    saveCaptions,
    savePosterFrame,
  };
}
