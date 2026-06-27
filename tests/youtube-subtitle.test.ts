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
  extractSubstackVttUrl,
  findActiveYouTubeCue,
  isSubstackSubtitleEnabled,
  normalizeSubtitleText,
  parseSubtitleTimestampMs,
  parseWebVttCues,
  parseYouTubeJson3Cues,
  transcriptRowsToSubtitleCues,
  textTrackCuesToSubtitleCues,
} from "../entrypoints/main/youtube-subtitle";

describe("YouTube subtitle json3 parsing", () => {
  it("normalizes subtitle text from timedtext or visible caption DOM", () => {
    expect(normalizeSubtitleText("<b>Hello</b>\u200B   world\nagain")).toBe("Hello world again");
  });

  it("converts text track cues for lookahead translation", () => {
    expect(textTrackCuesToSubtitleCues([
      { startTime: 1.2, endTime: 2.8, text: " first  cue " },
      { startTime: 3, endTime: 3, text: "" },
    ])).toEqual([
      { startMs: 1200, durMs: 1600, text: "first cue" },
    ]);
  });

  it("parses WebVTT cues from Substack caption files", () => {
    expect(parseWebVttCues(`WEBVTT

1
00:00:01.200 --> 00:00:02.800
Hello
world

2
00:00:03.000 --> 00:00:04.000
<v SPEAKER_01>Next cue
`)).toEqual([
      { startMs: 1200, durMs: 1600, text: "Hello world" },
      { startMs: 3000, durMs: 1000, text: "Next cue" },
    ]);
  });

  it("extracts Substack VTT URLs from embedded page data", () => {
    expect(extractSubstackVttUrl(
      '\\"url\\":\\"https://substackcdn.com/video_upload/post/1/asset/en.vtt?Expires=1&Key-Pair-Id=abc&Signature=sig__\\",',
    )).toBe("https://substackcdn.com/video_upload/post/1/asset/en.vtt?Expires=1&Key-Pair-Id=abc&Signature=sig__");
  });

  it("treats visible Substack captions as enabled even when native tracks are disabled", () => {
    expect(isSubstackSubtitleEnabled(["disabled"], " current caption ")).toBe(true);
    expect(isSubstackSubtitleEnabled(["disabled"], "")).toBe(false);
    expect(isSubstackSubtitleEnabled(["showing"], "")).toBe(true);
  });

  it("parses transcript timestamps", () => {
    expect(parseSubtitleTimestampMs("0:13")).toBe(13000);
    expect(parseSubtitleTimestampMs("1:02:03")).toBe(3723000);
    expect(parseSubtitleTimestampMs("bad")).toBeNull();
  });

  it("splits transcript rows into timed subtitle cues for pretranslation", () => {
    expect(transcriptRowsToSubtitleCues([
      {
        startMs: 0,
        text: "One two three four five six seven eight nine. ten eleven twelve.",
      },
      {
        startMs: 4000,
        text: "Next row starts here.",
      },
    ])).toEqual([
      {
        startMs: 0,
        durMs: 2000,
        text: "One two three four five six seven eight nine.",
      },
      {
        startMs: 2000,
        durMs: 2000,
        text: "ten eleven twelve.",
      },
      {
        startMs: 4000,
        durMs: 5000,
        text: "Next row starts here.",
      },
    ]);
  });

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
