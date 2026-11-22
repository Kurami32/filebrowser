import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSourceKey,
  type CommittedSource,
  revokeReplacedSubtitles,
  revokeSubtitleUrls,
} from "../committedSource.ts";

function source(urls: string[]): CommittedSource {
  return {
    key: "k",
    kind: "video",
    req: {},
    raw: "/raw",
    subtitles: urls.map((src) => ({ name: src, src })),
    lyrics: [],
  };
}

describe("committedSource", () => {
  let revoke: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { revokeObjectURL: revoke }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the key from share hash, source and path", () => {
    expect(buildSourceKey("h", "src", "/a.mp3")).toBe("h|src|/a.mp3");
    expect(buildSourceKey(undefined, undefined, undefined)).toBe("||");
    expect(buildSourceKey("", "src", "/a.mp3")).not.toBe(buildSourceKey("", "src", "/b.mp3"));
  });

  it("revokes only blob URLs", () => {
    revokeSubtitleUrls([
      { name: "a", src: "blob:a" },
      { name: "b", src: "/api/b.vtt" },
    ]);
    expect(revoke).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:a");
  });

  it("revokes the previous subtitles that the next source does not keep", () => {
    revokeReplacedSubtitles(source(["blob:a", "blob:b"]), source(["blob:b", "blob:c"]));
    expect(revoke).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:a");
  });

  it("revokes everything when there is no next source and nothing without a previous one", () => {
    revokeReplacedSubtitles(source(["blob:a"]), null);
    expect(revoke).toHaveBeenCalledWith("blob:a");
    revoke.mockClear();
    revokeReplacedSubtitles(null, source(["blob:a"]));
    expect(revoke).not.toHaveBeenCalled();
  });
});
