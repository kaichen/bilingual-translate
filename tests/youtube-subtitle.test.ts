import { describe, expect, it, vi } from "vitest";

vi.mock("@/entrypoints/config/config", () => ({
  config: {
    youtubeSubtitle: true,
  },
}));

vi.mock("@/entrypoints/translate/translateApi", () => ({
  cancelAllTranslations: vi.fn(),
  translateText: vi.fn(),
}));

import {
  findActiveYouTubeCue,
  parseYouTubeJson3Cues,
} from "../entrypoints/main/youtube-subtitle";

describe("YouTube subtitle json3 parsing", () => {
  it("converts json3 events to cleaned cues and filters events without segs", () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 1000 },
        {
          tStartMs: 1200,
          dDurationMs: 1600,
          segs: [
            { utf8: "<b>Hello</b>" },
            { utf8: "\u200B world" },
          ],
        },
      ],
    });

    expect(parseYouTubeJson3Cues(body)).toEqual([
      { startMs: 1200, durMs: 1600, text: "Hello world" },
    ]);
  });

  it("dedupes ASR captions that grow word by word", () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 500, segs: [{ utf8: "Hello" }] },
        { tStartMs: 200, dDurationMs: 500, segs: [{ utf8: "Hello world" }] },
        { tStartMs: 800, dDurationMs: 300, segs: [{ utf8: "Hello world" }] },
      ],
    });

    expect(parseYouTubeJson3Cues(body)).toEqual([
      { startMs: 0, durMs: 700, text: "Hello world" },
    ]);
  });

  it("returns an empty list for invalid json", () => {
    expect(parseYouTubeJson3Cues("not json")).toEqual([]);
  });
});

describe("YouTube active subtitle lookup", () => {
  const cues = [
    { startMs: 1000, durMs: 2000, text: "first" },
    { startMs: 4000, durMs: 1000, text: "second" },
  ];

  it("finds the cue active at the current timestamp", () => {
    expect(findActiveYouTubeCue(cues, 999)).toBeUndefined();
    expect(findActiveYouTubeCue(cues, 1000)).toBe(cues[0]);
    expect(findActiveYouTubeCue(cues, 2999)).toBe(cues[0]);
    expect(findActiveYouTubeCue(cues, 3000)).toBeUndefined();
    expect(findActiveYouTubeCue(cues, 4500)).toBe(cues[1]);
  });
});
