import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectTranslationTargets,
  getTranslationTargetSourceKey,
  resetTranslationTargetDom,
} from "../entrypoints/main/dom";

const xUrl = "https://x.com/home";

vi.mock("@/entrypoints/main/trans", () => ({
  handleBtnTranslation: vi.fn(),
}));

describe("X.com reused tweet source key handling", () => {
  beforeEach(() => {
    (window as Window & { happyDOM?: { setURL(url: string): void } }).happyDOM?.setURL(xUrl);
    document.body.innerHTML = "";
  });

  it("ignores existing translation content when creating the source key", () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <div data-testid="tweetText" lang="en">
          Original tweet text.
          <span class="bilingual-translate-bilingual-content">已有译文</span>
        </div>
      </article>
    `;

    const [target] = collectTranslationTargets(document.body);

    expect(getTranslationTargetSourceKey(target)).toBe("Original tweet text.");
  });

  it("clears stale translated state when a virtualized tweet node is reused with new text", () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <div data-testid="tweetText" lang="en" data-bt-translated="true" data-bt-node-id="bt-node-1" data-bt-source-key="Old tweet text.">
          New tweet text after virtualization.
          <span class="bilingual-translate-bilingual-content" data-bt-source-key="Old tweet text.">旧译文</span>
        </div>
      </article>
    `;

    const [target] = collectTranslationTargets(document.body);

    expect(getTranslationTargetSourceKey(target)).toBe("New tweet text after virtualization.");

    resetTranslationTargetDom(target, "Old tweet text.");

    const tweetText = document.querySelector('[data-testid="tweetText"]') as HTMLElement;
    expect(tweetText.hasAttribute("data-bt-translated")).toBe(false);
    expect(tweetText.hasAttribute("data-bt-node-id")).toBe(false);
    expect(tweetText.hasAttribute("data-bt-source-key")).toBe(false);
    expect(tweetText.querySelector(".bilingual-translate-bilingual-content")).toBeNull();
  });
});
