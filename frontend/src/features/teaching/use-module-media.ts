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
import type { MediaUploadUrl, ModuleMedia } from "@/features/teaching/types";

export interface ModuleMediaState {
  media: ModuleMedia | null;
  loading: boolean;
  error: string | null;
  /** Percent complete per reference key, while an upload is in flight. */
  uploadProgress: Record<string, number>;
  upload: (key: string, file: File) => Promise<void>;
  remove: (assetId: string) => Promise<void>;
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
        reject(new Error(`Could not start upload (${request.status})`));
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
        reject(new Error(`Upload failed (${request.status})`));
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
    };
  }

  return { media, loading, error, uploadProgress, upload, remove };
}
