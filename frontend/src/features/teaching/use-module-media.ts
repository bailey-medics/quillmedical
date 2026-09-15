/**
 * The admin card's data and actions for one module's videos.
 *
 * Upload is three steps, not one: ask the backend for a resumable URL,
 * send the bytes straight to GCS, then tell the backend what landed.
 * The middle step deliberately does not go through our API — a lecture
 * is hundreds of megabytes and routing it through Cloud Run would pay
 * for the transfer twice and hold a request open throughout.
 *
 * That is also why the backend never sees the file: it mints a URL and
 * records the result, and the bytes go straight past it.
 */

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
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
}

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
 * is usually wrong — "too large" and "wrong format" look identical as
 * a number. Each case here names the fault and, where the admin can
 * act on it, what to do instead.
 */
function describeUploadFailure(status: number, file: File): string {
  if (status === 413) {
    return `This file is too large to upload (${formatSize(file.size)}). Try a shorter recording or a more compressed export.`;
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
    return `The server could not accept the upload (${status}). This is not a problem with your file — try again shortly.`;
  }
  return `Upload failed (${status})`;
}

/**
 * Open a resumable upload session and return the URL to send bytes to.
 *
 * The signed URL the backend mints is for `POST` with an
 * `x-goog-resumable: start` header — that is what *begins* a resumable
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
        reject(new Error("Upload session was not returned"));
        return;
      }
      resolve(session);
    });
    request.addEventListener("error", () =>
      reject(new Error("Could not start upload")),
    );

    request.send();
  });
}

/** Send the file to an open session, reporting progress as it goes. */
function sendToSession(
  sessionUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  // XMLHttpRequest rather than fetch: fetch cannot report upload
  // progress, and on a file this size a bar is not decoration.
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", sessionUrl);
    request.setRequestHeader("Content-Type", file.type);

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
    request.addEventListener("error", () => reject(new Error("Upload failed")));
    request.addEventListener("abort", () =>
      reject(new Error("Upload cancelled")),
    );

    request.send(file);
  });
}

/**
 * Send one file to GCS.
 *
 * Two steps, not one. A local development URL is not a GCS resumable
 * URL, so it takes the single PUT it expects instead — the backend
 * decides which by whether it handed back an absolute URL.
 */
async function putToBucket(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  // A relative URL is the local route, which receives the body
  // directly. Only GCS speaks the resumable handshake.
  if (!/^https?:\/\//.test(url)) {
    return sendToSession(url, file, onProgress);
  }

  const session = await startResumableUpload(url, file);
  return sendToSession(session, file, onProgress);
}

export function useModuleMedia(moduleId: string | null): ModuleMediaState {
  const [media, setMedia] = useState<ModuleMedia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
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
        `/teaching/admin/modules/${moduleId}/media`,
      );
      setMedia(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load media");
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  useEffect(() => {
    // No module means nothing to fetch. Returning early rather than
    // clearing the loading flag here keeps every state change out of
    // the effect body — a synchronous setState in an effect costs a
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
    // second copy for the post-upload refresh to call — two copies of
    // one request, and the pair that drifts apart later.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [moduleId, refresh]);

  const upload = useCallback(
    async (key: string, file: File) => {
      if (!moduleId) return;
      setError(null);
      setUploadProgress((p) => ({ ...p, [key]: 0 }));

      try {
        const grant = await api.post<MediaUploadUrl>(
          `/teaching/admin/modules/${moduleId}/media/upload-url`,
          {
            media_key: key,
            original_filename: file.name,
            content_type: file.type,
            size_bytes: file.size,
          },
        );

        await putToBucket(grant.upload_url, file, (percent) =>
          setUploadProgress((p) => ({ ...p, [key]: percent })),
        );

        // The backend never saw the bytes, so this is what records that
        // they arrived. Until it runs the upload is invisible, and the
        // module stays incomplete.
        await api.post(
          `/teaching/admin/modules/${moduleId}/media/${key}/link`,
          {
            asset_id: grant.asset_id,
            original_filename: file.name,
            content_type: file.type,
            size_bytes: file.size,
          },
        );

        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        // Cleared whether it worked or not, so a failed upload returns
        // the row to a dropzone rather than a bar stuck at 60%.
        setUploadProgress((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        });
      }
    },
    [moduleId, refresh],
  );

  const remove = useCallback(
    async (assetId: string) => {
      if (!moduleId) return;
      try {
        setError(null);
        await api.del(`/teaching/admin/modules/${moduleId}/media/${assetId}`);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [moduleId, refresh],
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
          `/teaching/admin/modules/${moduleId}/media/${assetId}/captions`,
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load captions",
        );
        return null;
      }
    },
    [moduleId],
  );

  const saveCaptions = useCallback(
    async (assetId: string, webvtt: string): Promise<boolean> => {
      if (!moduleId) return false;
      try {
        setError(null);
        await api.put(
          `/teaching/admin/modules/${moduleId}/media/${assetId}/captions`,
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
    [moduleId, refresh],
  );

  // Derived rather than stored, so a null module reports "nothing to
  // load" immediately without an extra render.
  if (!moduleId) {
    return {
      media: null,
      loading: false,
      error: null,
      uploadProgress: {},
      upload,
      remove,
      loadCaptions,
      saveCaptions,
    };
  }

  return {
    media,
    loading,
    error,
    uploadProgress,
    upload,
    remove,
    loadCaptions,
    saveCaptions,
  };
}
