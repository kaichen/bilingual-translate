import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/entrypoints/translate/cache", () => ({
  cache: {
    localGet: vi.fn(() => null),
    localSet: vi.fn(),
    localSetDual: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("@/entrypoints/config/check", () => ({
  checkConfig: vi.fn(() => true),
  searchClassName: vi.fn(() => null),
  skipNode: vi.fn(() => false),
}));

vi.mock("@/entrypoints/config/config", () => ({
  config: {
    on: true,
    display: 1,
    style: "",
    service: "mock",
    to: "zh",
    useCache: false,
    count: 0,
    token: {},
    model: {},
    customModel: {},
  },
}));

vi.mock("@/entrypoints/ui/icon", () => ({
  insertFailedTip: vi.fn(),
  insertLoadingSpinner: vi.fn(() => ({ remove: vi.fn() })),
}));

vi.mock("@/entrypoints/config/option", () => ({
  customModelString: "custom",
  options: { styles: [] },
  services: {
    deeplx: "deeplx",
    yiyan: "yiyan",
    tencent: "tencent",
    google: "google",
    cozecn: "cozecn",
    cozecom: "cozecom",
  },
  servicesType: {
    isAI: vi.fn(() => false),
    isMachine: vi.fn(() => false),
    isUseToken: vi.fn(() => false),
  },
}));

vi.mock("@/entrypoints/translate/translateApi", () => ({
  cancelAllTranslations: vi.fn(),
  translateText: vi.fn(),
}));

import {
  collectTranslationTargets,
  getTranslationTargetSourceKey,
  getTranslationTargetSourceText,
  type TranslationTarget,
} from "../entrypoints/main/dom";
import {
  findInlineXShowMoreButton,
  getXScanRoots,
  prepareXTranslationTarget,
} from "../entrypoints/main/trans";

const xUrl = "https://x.com/home";
const xPhotoUrl = "https://x.com/hu_yifei/status/2066925930271166549/photo/1";

function setXUrl(url = xUrl) {
  (window as Window & { happyDOM?: { setURL(url: string): void } }).happyDOM?.setURL(url);
}

function firstTweetTarget(): TranslationTarget {
  const target = collectTranslationTargets(document.body)
    .find(target => target.kind === "element" && target.element.matches('[data-testid="tweetText"]'));
  expect(target).toBeDefined();
  return target as TranslationTarget;
}

function renderTweet(tweetBody: string) {
  document.body.innerHTML = `
    <main role="main">
      <section data-testid="primaryColumn">
        <article data-testid="tweet">
          ${tweetBody}
        </article>
      </section>
    </main>
  `;
}

describe("X.com show more pre-expansion", () => {
  beforeEach(() => {
    setXUrl();
    document.body.innerHTML = "";
  });

  it("clicks inline Show more before returning the tweet translation target", async () => {
    const fullText = "Truncated text plus hidden continuation now fully loaded.";
    renderTweet(`
      <div data-testid="tweetText" lang="en">
        Truncated text
        <div role="button"><span>Show more</span></div>
      </div>
    `);

    const target = firstTweetTarget();
    const oldSourceKey = getTranslationTargetSourceKey(target);
    const tweetText = document.querySelector('[data-testid="tweetText"]') as HTMLElement;
    const showMore = tweetText.querySelector('[role="button"]') as HTMLElement;
    let clickCount = 0;

    showMore.addEventListener("click", () => {
      clickCount += 1;
      tweetText.textContent = fullText;
    });

    const preparedTarget = await prepareXTranslationTarget(target);

    expect(clickCount).toBe(1);
    expect(preparedTarget).not.toBe(false);
    expect(getTranslationTargetSourceText(preparedTarget as TranslationTarget)).toBe(fullText);
    expect(getTranslationTargetSourceKey(preparedTarget as TranslationTarget)).not.toBe(oldSourceKey);
  });

  it("does not treat Show more replies as a tweet expansion control", () => {
    renderTweet(`
      <div data-testid="tweetText" lang="en">Tweet text that is already visible.</div>
      <div role="button">Show more replies</div>
    `);

    const tweetText = document.querySelector('[data-testid="tweetText"]') as HTMLElement;
    const article = document.querySelector("article") as HTMLElement;

    expect(findInlineXShowMoreButton(tweetText, article)).toBeNull();
  });

  it("ignores show more controls inside action rows and compose boxes", () => {
    renderTweet(`
      <div data-testid="tweetText" lang="en">Tweet text that is already visible.</div>
      <div role="group" aria-label="Post actions">
        <button>Show more</button>
      </div>
      <div data-testid="tweetTextarea_0">
        <button>Show more</button>
      </div>
    `);

    const tweetText = document.querySelector('[data-testid="tweetText"]') as HTMLElement;
    const article = document.querySelector("article") as HTMLElement;

    expect(findInlineXShowMoreButton(tweetText, article)).toBeNull();
  });

  it("does not click Show more links that navigate to a status detail page", () => {
    renderTweet(`
      <div data-testid="tweetText" lang="en">
        Truncated text
        <a role="link" href="/example/status/1234567890"><span>Show more</span></a>
      </div>
    `);

    const tweetText = document.querySelector('[data-testid="tweetText"]') as HTMLElement;
    const article = document.querySelector("article") as HTMLElement;

    expect(findInlineXShowMoreButton(tweetText, article)).toBeNull();
  });

  it("includes photo view conversation rails in X scan roots", () => {
    setXUrl(xPhotoUrl);
    document.body.innerHTML = `
      <main role="main">
        <div role="dialog" aria-label="Image viewer">
          <img alt="paper screenshot" src="/paper.png" />
        </div>
      </main>
      <aside aria-label="Conversation">
        <section aria-label="Timeline: Conversation">
          <article data-testid="tweet">
            <div data-testid="tweetText" lang="en">Sidebar tweet text.</div>
          </article>
        </section>
      </aside>
    `;

    const rail = document.querySelector('[aria-label="Timeline: Conversation"]') as HTMLElement;
    const roots = getXScanRoots();

    expect(roots).toContain(document.body);
    expect(roots).toContain(rail);
  });
});
