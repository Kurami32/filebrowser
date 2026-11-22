import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { type App, createApp, h, nextTick, reactive } from "vue";
import AudioPlayer from "./AudioPlayer.vue";

const hoisted = vi.hoisted(() => ({
  plyrs: [] as Array<{ destroy: Mock; play: Mock; speed: number }>,
  play: undefined as undefined | ((...args: unknown[]) => unknown),
}));

vi.mock("plyr", () => ({
  default: class FakePlyr {
    media: HTMLMediaElement;
    speed = 1;
    playing = false;
    duration = 0;
    currentTime = 0;
    fullscreen = { active: false, enter: vi.fn() };
    on = vi.fn();
    off = vi.fn();
    destroy = vi.fn();
    pause = vi.fn();
    play = vi.fn(() => Promise.resolve());
    constructor(el: HTMLMediaElement) {
      this.media = el;
      hoisted.plyrs.push(this);
    }
  },
}));
vi.mock("@/i18n/index.ts", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/router/index.ts", () => ({
  router: { currentRoute: { value: { query: {}, path: "/files/src/a.mp3", hash: "" } }, replace: vi.fn() },
}));
vi.mock("@/store/index.ts", async () => {
  const { reactive: reactiveState } = await import("vue");
  return {
    state: reactiveState({
      route: { path: "/files/src/a.mp3" },
      sources: { current: "src" },
      navigation: { isTransitioning: false },
      playbackQueue: { queue: [], currentIndex: -1, loop: "off", shouldTogglePlayPause: false },
    }),
    getters: { isMobile: () => false },
    mutations: { setPlaybackState: vi.fn() },
  };
});
vi.mock("@/utils/constants.ts", () => ({ globalVars: { baseURL: "/", name: "FB", loginIcon: "/icon.png" } }));
vi.mock("@/utils/url.js", () => ({
  buildItemUrl: (source: string, path: string) => `/files/${source}${path}`,
  removeTrailingSlash: (path: string) => path.replace(/\/$/, ""),
}));
vi.mock("@/utils/playbackQueue.js", () => ({
  formatArtist: (artist: string) => artist,
  getEndOfMediaAction: vi.fn(),
  getNextItem: vi.fn(),
  navigatePlaybackQueue: vi.fn(),
}));
vi.mock("@/player/seekOnRelease.js", () => ({ blockSeekOnInput: vi.fn(), enableSeekOnRelease: () => () => {} }));
vi.mock("@/components/files/AudioPanel.vue", () => ({ default: { render: () => null } }));
vi.mock("@/components/files/LyricsList.vue", () => ({ default: { render: () => null } }));
vi.mock("@/components/settings/FloatingActionButton.vue", () => ({ default: { render: () => null } }));
vi.mock("@/components/player/PlayerOverlays.vue", () => ({ default: { render: () => null } }));
vi.mock("@/composables/player/useAudioVisualizer.ts", () => ({
  useAudioVisualizer: () => ({
    audioContext: { value: null },
    audioSource: { value: null },
    setupAudioVisualizer: vi.fn(),
    resumeAudioGraph: vi.fn(),
    cleanupAudioVisualizer: vi.fn(),
  }),
}));
vi.mock("@/composables/player/useDoubleTapSeek.ts", () => ({
  useDoubleTapSeek: () => ({
    skipFeedbackVisible: { value: false },
    skipFeedbackSide: { value: "left" },
    skipFeedbackIcon: { value: "" },
    skipFeedbackKey: { value: 0 },
    flashSkipFeedback: vi.fn(),
    setupDoubleTapSeek: vi.fn(),
    teardownDoubleTapSeek: vi.fn(),
    setupRewindForwardFeedback: vi.fn(),
    clearRewindForwardFeedback: vi.fn(),
    getGestureSurface: vi.fn(),
    isControlOrMenuTarget: vi.fn(),
  }),
}));
vi.mock("@/composables/player/useSwipeNavigationGestures.ts", () => ({
  useSwipeNavigationGestures: () => ({
    speedToastVisible: { value: false },
    speedToastMessage: { value: "" },
    setupSwipeGestures: vi.fn(),
    teardownSwipeGestures: vi.fn(),
    clearDismissAnimTimers: vi.fn(),
  }),
}));
vi.mock("@/composables/player/useMediaKeyboard.ts", () => ({
  useMediaKeyboard: () => ({ attachKeyboard: vi.fn(), detachKeyboard: vi.fn() }),
}));
vi.mock("@/composables/player/usePlaybackQueue.ts", async () => {
  const { ref } = await import("vue");
  return {
    usePlaybackQueue: () => ({
      queueCount: ref(0),
      playbackQueue: ref([]),
      loop: ref("off"),
      toastVisible: ref(false),
      toastType: ref("mode"),
      toastIcon: ref(""),
      playbackModeMessage: ref(""),
      showQueuePrompt: vi.fn(),
      toggleSingleLoop: vi.fn(),
      cyclePlaybackModes: vi.fn(),
      playbackMenuInitialized: ref(false),
      loopMenuInitialized: ref(false),
      applyPlaybackMenu: vi.fn(),
      applyLoopMenu: vi.fn(),
      resetPlaybackMenuState: vi.fn(),
    }),
  };
});

const FILE_A = {
  fileKey: "|src|/a.mp3",
  raw: "/raw/a.mp3",
  req: { name: "a.mp3", type: "audio/mpeg", source: "src", path: "/a.mp3", metadata: { title: "Song A", albumArt: btoa("a") } },
};
const FILE_B = {
  fileKey: "|src|/b.mp3",
  raw: "/raw/b.mp3",
  req: { name: "b.mp3", type: "audio/mpeg", source: "src", path: "/b.mp3", metadata: { title: "Song B", albumArt: btoa("b") } },
};

async function settle() {
  for (let i = 0; i < 5; i++) {
    await nextTick();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

describe("AudioPlayer file swap", () => {
  let app: App;
  let container: HTMLElement;
  let props: Record<string, unknown>;
  let created: string[];
  let revoke: ReturnType<typeof vi.fn>;
  let unmounted = false;
  let session: { metadata: unknown; setActionHandler: ReturnType<typeof vi.fn>; playbackState: string };

  async function mountPlayer(initial: Record<string, unknown>) {
    props = reactive({ ...FILE_A, autoPlayEnabled: false, ...initial });
    container = document.createElement("div");
    document.body.appendChild(container);
    app = createApp({ render: () => h(AudioPlayer, props as never) });
    app.mount(container);
    await settle();
  }

  async function swapTo(file: typeof FILE_B) {
    Object.assign(props, file);
    await settle();
  }

  beforeEach(() => {
    hoisted.plyrs.length = 0;
    unmounted = false;
    created = [];
    revoke = vi.fn();
    session = { metadata: null, setActionHandler: vi.fn(), playbackState: "none" };
    vi.stubGlobal("MediaMetadata", class FakeMetadata {
      constructor(init: object) {
        Object.assign(this, init);
      }
    });
    Object.defineProperty(navigator, "mediaSession", { value: session, configurable: true });
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => {
          const url = `blob:art-${created.length}`;
          created.push(url);
          return url;
        }),
        revokeObjectURL: revoke,
      }),
    );
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
      this.playbackRate = this.defaultPlaybackRate;
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  afterEach(() => {
    if (!unmounted) app.unmount();
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (navigator as unknown as Record<string, unknown>).mediaSession;
  });

  it("keeps the Plyr instance and the element, and swaps src and metadata", async () => {
    await mountPlayer({});
    const audio = container.querySelector("audio");
    expect(hoisted.plyrs).toHaveLength(1);
    expect(audio?.getAttribute("src")).toBe("/raw/a.mp3");
    expect(container.querySelector(".audio-title")?.textContent?.trim()).toBe("Song A");

    await swapTo(FILE_B);

    expect(hoisted.plyrs).toHaveLength(1);
    expect(hoisted.plyrs[0]?.destroy).not.toHaveBeenCalled();
    expect(container.querySelector("audio")).toBe(audio);
    expect(audio?.getAttribute("src")).toBe("/raw/b.mp3");
    expect(container.querySelector(".audio-title")?.textContent?.trim()).toBe("Song B");
  });

  it("revokes the previous artwork and shows the new one", async () => {
    await mountPlayer({});
    expect(container.querySelector("img.album-art")?.getAttribute("src")).toBe("blob:art-0");
    await swapTo(FILE_B);
    expect(container.querySelector("img.album-art")?.getAttribute("src")).toBe("blob:art-1");
    expect(revoke).toHaveBeenCalledWith("blob:art-0");
  });

  it("updates the media session metadata without registering the handlers again", async () => {
    await mountPlayer({});
    const handlers = session.setActionHandler.mock.calls.length;
    expect(session.metadata).toMatchObject({ title: "Song A" });
    await swapTo(FILE_B);
    expect(session.metadata).toMatchObject({ title: "Song B", artwork: [{ src: "blob:art-1" }] });
    expect(session.setActionHandler).toHaveBeenCalledTimes(handlers);
  });

  it("starts playback after the swap when autoplay is on", async () => {
    await mountPlayer({ autoPlayEnabled: true });
    const plyr = hoisted.plyrs[0];
    plyr?.play.mockClear();
    await swapTo(FILE_B);
    expect(plyr?.play).toHaveBeenCalledOnce();
  });

  it("does not start playback after the swap when autoplay is off", async () => {
    await mountPlayer({});
    await swapTo(FILE_B);
    expect(hoisted.plyrs[0]?.play).not.toHaveBeenCalled();
  });

  it("re-applies the playback rate", async () => {
    await mountPlayer({});
    const audio = container.querySelector("audio") as HTMLAudioElement;
    audio.playbackRate = 1.5;
    await swapTo(FILE_B);
    expect(audio.playbackRate).toBe(1.5);
    expect(hoisted.plyrs[0]?.speed).toBe(1.5);
  });

  it("does nothing when the key stays the same", async () => {
    await mountPlayer({ autoPlayEnabled: true });
    const plyr = hoisted.plyrs[0];
    plyr?.play.mockClear();
    Object.assign(props, { req: { ...FILE_A.req, metadata: { title: "Late patch" } } });
    await settle();
    expect(plyr?.play).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("destroys the instance only on unmount", async () => {
    await mountPlayer({});
    await swapTo(FILE_B);
    app.unmount();
    unmounted = true;
    expect(hoisted.plyrs[0]?.destroy).toHaveBeenCalledOnce();
  });
});
