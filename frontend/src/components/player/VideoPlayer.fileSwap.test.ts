import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { type App, createApp, h, nextTick, reactive } from "vue";
import VideoPlayer from "./VideoPlayer.vue";

const hoisted = vi.hoisted(() => ({
  plyrs: [] as Array<{ destroy: Mock; playMock: Mock; speed: number }>,
  /** Paths whose format needs transcoding first (the offer), and paths opened in an HLS mode by the URL. */
  needsTranscode: new Set<string>(),
  urlMode: new Map<string, string>(),
  videoPreviews: false,
  offerGate: null as null | Promise<void>,
  teardown: vi.fn(),
  resetFileState: vi.fn(),
  initMode: vi.fn(),
  startTranscode: vi.fn(),
  scrubCleanup: vi.fn(),
  scrub: vi.fn(),
  loadingCleanup: vi.fn(),
}));

vi.mock("plyr", () => ({
  default: class FakePlyr {
    media: HTMLMediaElement;
    speed = 1;
    playing = false;
    duration = 0;
    currentTime = 0;
    elements = { container: document.createElement("div") };
    fullscreen = { active: false, enter: vi.fn() };
    on = vi.fn();
    off = vi.fn();
    destroy = vi.fn();
    pause = vi.fn();
    /** `play` itself is replaced by the deferred-attach override; this is the native one it ends up calling. */
    playMock = vi.fn(() => Promise.resolve());
    play = this.playMock;
    constructor(el: HTMLMediaElement) {
      this.media = el;
      hoisted.plyrs.push(this);
    }
  },
}));
vi.mock("@/i18n/index.ts", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("vue-router", () => ({ useRoute: () => ({ query: {}, path: "/files/src/a.mp4" }) }));
vi.mock("@/router/index.ts", () => ({
  router: { currentRoute: { value: { query: {}, path: "/files/src/a.mp4", hash: "" } }, replace: vi.fn() },
}));
vi.mock("@/store/index.ts", async () => {
  const { reactive: reactiveState } = await import("vue");
  return {
    state: reactiveState({
      route: { path: "/files/src/a.mp4" },
      sources: { current: "src" },
      navigation: { isTransitioning: false },
      playbackQueue: { queue: [], currentIndex: -1, loop: "off", shouldTogglePlayPause: false, isPlaying: false },
      mediaSettings: { enabled: true, profiles: [] },
      shareInfo: {},
    }),
    getters: {
      isMobile: () => false,
      isLoggedIn: () => true,
      isShare: () => false,
      previewPerms: () => ({ video: hoisted.videoPreviews }),
      sourcePermissions: () => ({ download: true }),
    },
    mutations: { setPlaybackState: vi.fn() },
  };
});
vi.mock("@/api/resources.js", () => ({ getPreviewURL: () => "/preview", getPreviewURLPublic: () => "/preview" }));
vi.mock("@/api/index.js", () => ({ resourcesApi: { getDownloadURL: () => "/download", getDownloadURLPublic: () => "/download" } }));
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
vi.mock("@/player/scrubPreview.js", () => ({
  enableScrubPreview: (...args: unknown[]) => {
    hoisted.scrub(...args);
    return hoisted.scrubCleanup;
  },
}));
vi.mock("@/player/videoLoading.js", () => ({ enableVideoLoadingIndicator: () => hoisted.loadingCleanup }));
vi.mock("@/components/files/PreviewNotice.vue", () => ({ default: { render: () => h("div", { class: "offer-notice" }) } }));
vi.mock("@/components/LoadingSpinner.vue", () => ({ default: { render: () => null } }));
vi.mock("@/components/settings/FloatingActionButton.vue", () => ({ default: { render: () => null } }));
vi.mock("@/components/player/PlayerOverlays.vue", () => ({ default: { render: () => null } }));
vi.mock("@/composables/player/useDoubleTapSeek.ts", async () => {
  const { ref } = await import("vue");
  return {
    useDoubleTapSeek: () => ({
      skipFeedbackVisible: ref(false),
      skipFeedbackSide: ref("left"),
      skipFeedbackIcon: ref(""),
      skipFeedbackKey: ref(0),
      hasStartedPlayback: ref(false),
      flashSkipFeedback: vi.fn(),
      setupDoubleTapSeek: vi.fn(),
      teardownDoubleTapSeek: vi.fn(),
      setupRewindForwardFeedback: vi.fn(),
      clearRewindForwardFeedback: vi.fn(),
      setupOverlaidHintController: vi.fn(),
      teardownOverlaidHintController: vi.fn(),
      resetOverlaidHints: vi.fn(),
      syncOverlaidHintPlayback: vi.fn(),
      getGestureSurface: vi.fn(),
      isControlOrMenuTarget: vi.fn(),
    }),
  };
});
vi.mock("@/composables/player/useSwipeNavigationGestures.ts", async () => {
  const { ref } = await import("vue");
  return {
    useSwipeNavigationGestures: () => ({
      speedToastVisible: ref(false),
      speedToastMessage: ref(""),
      resetEdgeGestureImmediate: vi.fn(),
      setupSwipeGestures: vi.fn(),
      teardownSwipeGestures: vi.fn(),
      clearDismissAnimTimers: vi.fn(),
    }),
  };
});
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
/** A small stand-in for the transcode logic: the swap orchestration is what is under test here. */
vi.mock("@/composables/player/useTranscodePlayback.ts", async () => {
  const { computed, ref } = await import("vue");
  return {
    useTranscodePlayback: (opts: {
      shouldAutoplay: { value: boolean };
      getReq: () => { path: string };
      getRaw: () => string;
      onOfferShown: () => void;
    }) => {
      const transcodeOffer = ref<unknown>(null);
      const startRequested = ref(false);
      const transcodeMode = ref("native");
      const videoStreamAttached = ref(false);
      const lockedNativeVideoSrc = ref<string | null>(null);
      let offerId = 0;
      const needs = () => hoisted.needsTranscode.has(opts.getReq().path);
      const isTranscodePlaybackMode = computed(() => transcodeMode.value !== "native");
      const shouldAttachVideoStream = computed(
        () => !needs() && (videoStreamAttached.value || opts.shouldAutoplay.value),
      );
      return {
        transcodeMode,
        transcodeSwitchInProgress: ref(false),
        transcodeOffer,
        transcodePlayback: ref(null),
        startRequested,
        lockedNativeVideoSrc,
        transcodeEnabled: ref(true),
        transcodeActive: ref(false),
        transcodeStartInProgress: ref(false),
        isTranscodePlaybackMode,
        wantsTranscodePlayback: isTranscodePlaybackMode,
        formatNeedsTranscode: computed(needs),
        shouldProactivelyOfferTranscode: computed(
          () => !startRequested.value && !isTranscodePlaybackMode.value && needs(),
        ),
        shouldAttachVideoStream,
        nativeVideoSrc: computed(() =>
          isTranscodePlaybackMode.value || needs() || !shouldAttachVideoStream.value ? null : opts.getRaw(),
        ),
        videoElementAutoplay: ref(false),
        videoStreamAttached,
        resetFileState: () => {
          hoisted.resetFileState();
          offerId++;
          videoStreamAttached.value = false;
          lockedNativeVideoSrc.value = null;
        },
        initTranscodeModeFromRoute: () => {
          hoisted.initMode();
          transcodeMode.value = hoisted.urlMode.get(opts.getReq().path) ?? "native";
        },
        ensureTranscodePlaybackController: vi.fn(),
        offerTranscodePlayback: async () => {
          const id = ++offerId;
          await hoisted.offerGate;
          if (id !== offerId) return;
          transcodeOffer.value = { mode: "offer", sessions: [] };
          opts.onOfferShown();
        },
        startTranscodePlayback: hoisted.startTranscode,
        switchTranscodeMode: vi.fn(),
        teardownTranscodePlayback: hoisted.teardown,
        disposeTranscodeController: vi.fn(),
        attachVideoStreamAndPlay: vi.fn(),
        clearAttachVideoStreamWait: vi.fn(),
        disarmResumeOnNextGesture: vi.fn(),
        startVideoTranscode: vi.fn(),
        onVideoLoadedMetadata: vi.fn(),
        onVideoPlaybackError: vi.fn(),
      };
    },
  };
});

const SUB = (name: string) => ({ name: `${name}.srt`, src: `blob:${name}`, srclang: "en" });
const file = (name: string, extra: Record<string, unknown> = {}) => ({
  fileKey: `|src|/${name}.mp4`,
  raw: `/raw/${name}.mp4`,
  req: { name: `${name}.mp4`, type: "video/mp4", source: "src", path: `/${name}.mp4`, metadata: { title: name } },
  subtitlesList: [],
  ...extra,
});
const FILE_A = file("a");
const FILE_B = file("b");
const FILE_C = file("c");

async function settle() {
  for (let i = 0; i < 5; i++) {
    await nextTick();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

describe("VideoPlayer file swap", () => {
  let app: App;
  let container: HTMLElement;
  let props: Record<string, unknown>;
  let unmounted = false;
  let session: { metadata: unknown; setActionHandler: ReturnType<typeof vi.fn>; playbackState: string };

  async function mountPlayer(initial: Record<string, unknown> = {}) {
    props = reactive({ ...FILE_A, autoPlayEnabled: false, ...initial });
    container = document.createElement("div");
    document.body.appendChild(container);
    app = createApp({ render: () => h(VideoPlayer, props as never) });
    app.mount(container);
    await settle();
  }

  async function swapTo(next: Record<string, unknown>) {
    Object.assign(props, next);
    await settle();
  }

  const video = () => container.querySelector("video") as HTMLVideoElement;

  beforeEach(() => {
    hoisted.plyrs.length = 0;
    hoisted.needsTranscode.clear();
    hoisted.urlMode.clear();
    hoisted.offerGate = null;
    hoisted.videoPreviews = false;
    unmounted = false;
    vi.clearAllMocks();
    session = { metadata: null, setActionHandler: vi.fn(), playbackState: "none" };
    vi.stubGlobal(
      "MediaMetadata",
      class FakeMetadata {
        constructor(init: object) {
          Object.assign(this, init);
        }
      },
    );
    Object.defineProperty(navigator, "mediaSession", { value: session, configurable: true });
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

  describe("native to native", () => {
    it("keeps the Plyr instance and the element, and swaps src and the media session metadata", async () => {
      await mountPlayer({ autoPlayEnabled: true });
      const element = video();
      const handlers = session.setActionHandler.mock.calls.length;
      expect(hoisted.plyrs).toHaveLength(1);
      expect(element.getAttribute("src")).toBe("/raw/a.mp4");

      await swapTo(FILE_B);

      expect(hoisted.plyrs).toHaveLength(1);
      expect(hoisted.plyrs[0]?.destroy).not.toHaveBeenCalled();
      expect(video()).toBe(element);
      expect(element.getAttribute("src")).toBe("/raw/b.mp4");
      expect(session.metadata).toMatchObject({ title: "b" });
      expect(session.setActionHandler).toHaveBeenCalledTimes(handlers);
    });

    it("resets the per-file state and decides the transcode mode again for the new file", async () => {
      await mountPlayer();
      hoisted.initMode.mockClear();
      hoisted.resetFileState.mockClear();
      hoisted.scrub.mockClear();

      await swapTo(FILE_B);

      expect(hoisted.resetFileState).toHaveBeenCalled();
      expect(hoisted.initMode).toHaveBeenCalledTimes(1);
      expect(hoisted.teardown).toHaveBeenCalledWith({ stopSession: true });
    });

    it("starts playback when autoplay is on, and not when it is off", async () => {
      await mountPlayer({ autoPlayEnabled: true });
      hoisted.plyrs[0]?.playMock.mockClear();
      await swapTo(FILE_B);
      expect(hoisted.plyrs[0]?.playMock).toHaveBeenCalledOnce();

      props.autoPlayEnabled = false;
      await settle();
      hoisted.plyrs[0]?.playMock.mockClear();
      await swapTo(FILE_C);
      expect(hoisted.plyrs[0]?.playMock).not.toHaveBeenCalled();
    });

    it("keeps the playback rate", async () => {
      await mountPlayer();
      video().playbackRate = 1.5;
      await swapTo(FILE_B);
      expect(video().playbackRate).toBe(1.5);
      expect(hoisted.plyrs[0]?.speed).toBe(1.5);
    });

    it("sets up the scrub preview again, and drops the old one for a file without previews", async () => {
      hoisted.videoPreviews = true;
      await mountPlayer({ req: { ...FILE_A.req, hasPreview: true } });
      expect(hoisted.scrub).toHaveBeenCalledTimes(1);

      await swapTo(file("b", { req: { ...FILE_B.req, hasPreview: true } }));
      expect(hoisted.scrubCleanup).toHaveBeenCalledTimes(1);
      expect(hoisted.scrub).toHaveBeenCalledTimes(2);

      await swapTo(FILE_C);
      expect(hoisted.scrubCleanup).toHaveBeenCalledTimes(2);
      expect(hoisted.scrub).toHaveBeenCalledTimes(2);
      expect(hoisted.loadingCleanup).toHaveBeenCalledTimes(2);
    });

    it("does nothing when the key stays the same", async () => {
      await mountPlayer({ autoPlayEnabled: true });
      hoisted.plyrs[0]?.playMock.mockClear();
      hoisted.resetFileState.mockClear();
      Object.assign(props, { req: { ...FILE_A.req, metadata: { title: "late patch" } } });
      await settle();
      expect(hoisted.resetFileState).not.toHaveBeenCalled();
      expect(hoisted.plyrs[0]?.playMock).not.toHaveBeenCalled();
    });
  });

  describe("transcode", () => {
    it("stops the HLS session and plays the next native file on the same instance", async () => {
      hoisted.urlMode.set("/a.mp4", "balanced");
      await mountPlayer({ autoPlayEnabled: true });
      expect(hoisted.startTranscode).toHaveBeenCalledTimes(1);
      expect(video().getAttribute("src")).toBeNull();
      hoisted.teardown.mockClear();
      hoisted.startTranscode.mockClear();

      await swapTo(FILE_B);

      expect(hoisted.teardown).toHaveBeenCalledWith({ stopSession: true });
      expect(hoisted.startTranscode).not.toHaveBeenCalled();
      expect(hoisted.plyrs).toHaveLength(1);
      expect(video().getAttribute("src")).toBe("/raw/b.mp4");
    });

    it("shows the offer for a file that needs transcoding, then creates the player for the next file", async () => {
      await mountPlayer();
      hoisted.needsTranscode.add("/b.mp4");
      await swapTo(FILE_B);

      expect(container.querySelector(".offer-notice")).not.toBeNull();
      expect(hoisted.plyrs[0]?.destroy).toHaveBeenCalledOnce();

      await swapTo(FILE_C);

      expect(container.querySelector(".offer-notice")).toBeNull();
      expect(hoisted.plyrs).toHaveLength(2);
      expect(video()).not.toBeNull();
    });

    it("starts the HLS session of the next file from the URL mode on the same instance", async () => {
      await mountPlayer();
      hoisted.urlMode.set("/b.mp4", "quality");
      await swapTo(FILE_B);
      expect(hoisted.plyrs).toHaveLength(1);
      expect(hoisted.startTranscode).toHaveBeenCalledTimes(1);
      expect(video().getAttribute("src")).toBeNull();
    });
  });

  describe("rapid swaps", () => {
    it("drops the work of a file that was replaced while its offer lookup was pending", async () => {
      await mountPlayer({ autoPlayEnabled: true });
      let release!: () => void;
      hoisted.offerGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      hoisted.needsTranscode.add("/b.mp4");
      await swapTo(FILE_B); // its offer lookup is still pending
      hoisted.offerGate = null;

      await swapTo(FILE_C);
      release();
      await settle();

      expect(container.querySelector(".offer-notice")).toBeNull();
      expect(hoisted.plyrs).toHaveLength(1);
      expect(hoisted.plyrs[0]?.destroy).not.toHaveBeenCalled();
      expect(video().getAttribute("src")).toBe("/raw/c.mp4");
    });

    it("mounts the new file when the swap arrives before the first player exists", async () => {
      let release!: () => void;
      hoisted.offerGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      hoisted.needsTranscode.add("/a.mp4");
      await mountPlayer({ autoPlayEnabled: true }); // the first file's offer lookup is pending: no player yet
      expect(hoisted.plyrs).toHaveLength(0);
      hoisted.offerGate = null;

      await swapTo(FILE_B);
      release();
      await settle();

      expect(container.querySelector(".offer-notice")).toBeNull();
      expect(hoisted.plyrs).toHaveLength(1);
      expect(video().getAttribute("src")).toBe("/raw/b.mp4");
    });

    it("keeps one instance across several quick swaps", async () => {
      await mountPlayer({ autoPlayEnabled: true });
      for (const next of [FILE_B, FILE_C, FILE_B, FILE_C, FILE_B]) {
        Object.assign(props, next);
        await nextTick();
      }
      await settle();
      expect(hoisted.plyrs).toHaveLength(1);
      expect(video().getAttribute("src")).toBe("/raw/b.mp4");
    });
  });

  describe("subtitles", () => {
    it("adds and removes the tracks with the file", async () => {
      await mountPlayer();
      expect(container.querySelectorAll("track")).toHaveLength(0);

      await swapTo(file("b", { subtitlesList: [SUB("b1"), SUB("b2")] }));
      expect([...container.querySelectorAll("track")].map((t) => t.getAttribute("src"))).toEqual(["blob:b1", "blob:b2"]);
      expect(container.querySelector(".video-player-container")?.classList.contains("no-captions")).toBe(false);

      await swapTo(file("c"));
      expect(container.querySelectorAll("track")).toHaveLength(0);
      expect(container.querySelector(".video-player-container")?.classList.contains("no-captions")).toBe(true);
      expect(hoisted.plyrs).toHaveLength(1);
    });

    it("replaces the track elements instead of patching their src", async () => {
      await mountPlayer({ subtitlesList: [SUB("a1")] });
      const first = container.querySelector("track");

      await swapTo(file("b", { subtitlesList: [SUB("b1")] }));

      const second = container.querySelector("track");
      expect(second).not.toBe(first);
      expect(second?.getAttribute("src")).toBe("blob:b1");
      expect(container.contains(first)).toBe(false);
    });
  });

  it("destroys the instance only on unmount", async () => {
    await mountPlayer();
    await swapTo(FILE_B);
    expect(hoisted.plyrs[0]?.destroy).not.toHaveBeenCalled();
    app.unmount();
    unmounted = true;
    expect(hoisted.plyrs[0]?.destroy).toHaveBeenCalledOnce();
  });
});
