/**
 * Data access layer for learning modules.
 *
 * Fetches learning content from the backend API which reads from
 * the teaching repos (module.yaml + learning/content.mdx).
 */

import { api } from "@/lib/api";
import type {
  CompiledSlide,
  LearningContentResponse,
  LearningModule,
} from "./types";

/**
 * Returns all learning modules from the API, sorted by order.
 */
export async function getModules(): Promise<LearningModule[]> {
  return api.get<LearningModule[]>("/teaching/modules");
}

/** True for the error `api` throws when the backend refuses with a 403. */
export function isRefused(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    err.status === 403
  );
}

/**
 * Returns full learning content (slides) for a module, or null if not found.
 *
 * A refusal (403) is thrown, not turned into null: it means the person
 * lacks `view_teaching_cases`, and the page has to say that. Folded into
 * null it read as "no such module" and the slide page showed nothing.
 */
export async function getModuleDetail(
  moduleId: string,
): Promise<LearningContentResponse | null> {
  try {
    return await api.get<LearningContentResponse>(
      `/teaching/modules/${moduleId}/learning`,
    );
  } catch (err) {
    if (isRefused(err)) throw err;
    return null;
  }
}

/** Snake_case shape returned by the API */
interface ApiSlide {
  slide_index: number;
  layout: string;
  title: string;
  body?: string;
  callout_type?: string;
  callout_body?: string;
  youtube_id?: string;
  video_src?: string;
  video_src_1080p?: string;
  video_poster?: string;
  video_captions?: string;
  duration_seconds?: number;
  image_src?: string;
  image_alt?: string;
  image_caption?: string;
  image_position?: string;
}

/** Map API snake_case slide to frontend camelCase CompiledSlide */
function toCompiledSlide(s: ApiSlide): CompiledSlide {
  return {
    slideIndex: s.slide_index,
    layout: s.layout as CompiledSlide["layout"],
    title: s.title,
    body: s.body,
    calloutType: s.callout_type as CompiledSlide["calloutType"],
    calloutBody: s.callout_body,
    youtubeId: s.youtube_id,
    videoSrc: s.video_src,
    videoSrc1080p: s.video_src_1080p,
    videoPoster: s.video_poster,
    videoCaptions: s.video_captions,
    durationSeconds: s.duration_seconds,
    imageSrc: s.image_src,
    imageAlt: s.image_alt,
    imageCaption: s.image_caption,
    imagePosition: s.image_position as CompiledSlide["imagePosition"],
  };
}

/**
 * Returns compiled slides for a module, or null if not found. Throws when
 * the backend refuses, as `getModuleDetail` does.
 */
export async function getModuleSlides(
  moduleId: string,
): Promise<CompiledSlide[] | null> {
  const content = await getModuleDetail(moduleId);
  if (!content) return null;
  return (content.slides as unknown as ApiSlide[]).map(toCompiledSlide);
}
