import type { LyricLines } from "@/utils/lyrics.ts";

export interface SubtitleSource {
  name: string;
  src: string;
  srclang?: string;
}

/** Everything the players need for one file, committed only once all of it is loaded. */
export interface CommittedSource<Req = unknown> {
  /** `buildSourceKey` of the file. */
  key: string;
  kind: "audio" | "video";
  req: Req;
  raw: string;
  subtitles: SubtitleSource[];
  lyrics: LyricLines;
}

export function buildSourceKey(shareHash?: string | null, source?: string, path?: string): string {
  return `${shareHash ?? ""}|${source ?? ""}|${path ?? ""}`;
}

export function revokeSubtitleUrls(subtitles: readonly SubtitleSource[]): void {
  for (const subtitle of subtitles) {
    if (subtitle.src.startsWith("blob:")) URL.revokeObjectURL(subtitle.src);
  }
}

/** Revokes the blob URLs of `previous` that `next` does not keep. */
export function revokeReplacedSubtitles(previous: CommittedSource | null, next: CommittedSource | null): void {
  if (!previous) return;
  const kept = new Set(next?.subtitles.map((subtitle) => subtitle.src));
  revokeSubtitleUrls(previous.subtitles.filter((subtitle) => !kept.has(subtitle.src)));
}
