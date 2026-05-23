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

/**
 * Returns full learning content (slides) for a module, or null if not found.
 */
export async function getModuleDetail(
  moduleId: string,
): Promise<LearningContentResponse | null> {
  try {
    return await api.get<LearningContentResponse>(
      `/teaching/modules/${moduleId}/learning`,
    );
  } catch {
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
  duration_seconds?: number;
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
    durationSeconds: s.duration_seconds,
  };
}

/**
 * Returns compiled slides for a module, or null if not found.
 */
export async function getModuleSlides(
  moduleId: string,
): Promise<CompiledSlide[] | null> {
  const content = await getModuleDetail(moduleId);
  if (!content) return null;
  return (content.slides as unknown as ApiSlide[]).map(toCompiledSlide);
}
