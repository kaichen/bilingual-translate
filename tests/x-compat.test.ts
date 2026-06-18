import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectTranslationTargets, getTranslationTargetText, grabAllNode } from "../entrypoints/main/dom";

vi.mock("@/entrypoints/main/trans", () => ({
  handleBtnTranslation: vi.fn(),
}));

const xUrl = "https://x.com/home";
const xPhotoUrl = "https://x.com/hu_yifei/status/2066925930271166549/photo/1";

function setXUrl(url = xUrl) {
  (window as Window & { happyDOM?: { setURL(url: string): void } }).happyDOM?.setURL(url);
}

function renderTimeline() {
  document.body.innerHTML = `
    <main role="main">
      <section data-testid="primaryColumn">
        <article data-testid="tweet">
          <div data-testid="User-Name">
            <span>Jane Doe</span>
            <span>@jane</span>
            <time>1h</time>
          </div>
          <div data-testid="tweetText" lang="en">This is the first tweet body that should be translated.</div>
          <div role="group" aria-label="Post actions">
            <button data-testid="reply">Reply</button>
            <span>12</span>
          </div>
        </article>
        <article data-testid="tweet">
          <div data-testid="tweetText" lang="en">Outer tweet text.</div>
          <div role="link" aria-label="Quoted post">
            <div data-testid="tweetText" lang="en">Quoted tweet text.</div>
          </div>
        </article>
        <div data-testid="tweetTextarea_0">Compose draft should not translate.</div>
        <aside data-testid="sidebarColumn">
          <div data-testid="tweetText">Sidebar copy should not translate.</div>
        </aside>
      </section>
    </main>
  `;
}

describe("X.com site compatibility rule", () => {
  beforeEach(() => {
    setXUrl();
    document.body.innerHTML = "";
  });

  it("selects tweet bodies without usernames, metadata, actions, compose boxes, or sidebars", () => {
    renderTimeline();

    expect(grabAllNode(document.body).map(node => node.textContent?.trim())).toEqual([
      "This is the first tweet body that should be translated.",
      "Outer tweet text.",
      "Quoted tweet text.",
    ]);
  });

  it("finds tweet bodies from newly appended timeline nodes", () => {
    renderTimeline();
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]') as HTMLElement;
    const addedTweet = document.createElement("article");
    addedTweet.setAttribute("data-testid", "tweet");
    addedTweet.innerHTML = `
      <div data-testid="User-Name">@new_user</div>
      <div data-testid="tweetText" lang="en">A newly loaded tweet after scrolling.</div>
    `;

    primaryColumn.append(addedTweet);

    expect(collectTranslationTargets(addedTweet).map(getTranslationTargetText)).toEqual([
      "A newly loaded tweet after scrolling.",
    ]);
  });

  it("selects long tweet bodies that exceed the generic text limit", () => {
    const longTweetText = `Silver falls despite the Iran war. ${"Market liquidity contagion keeps moving through every position. ".repeat(90)}`.trim();
    expect(longTweetText.length).toBeGreaterThan(4096);

    document.body.innerHTML = `
      <main role="main">
        <section data-testid="primaryColumn">
          <article data-testid="tweet">
            <div data-testid="User-Name">@metals</div>
            <div data-testid="tweetText" lang="en">${longTweetText}</div>
          </article>
        </section>
      </main>
    `;

    expect(collectTranslationTargets(document.body).map(getTranslationTargetText)).toEqual([
      longTweetText,
    ]);
  });

  it("selects tweet bodies from the photo view conversation rail without translating media or controls", () => {
    setXUrl(xPhotoUrl);
    document.body.innerHTML = `
      <main role="main">
        <div role="dialog" aria-label="Image">
          <img alt="technical report screenshot" src="/paper.png" />
        </div>
      </main>
      <aside aria-label="Conversation">
        <section aria-label="Timeline: Conversation">
          <article data-testid="tweet">
            <div data-testid="User-Name">
              <span>Yifei Hu</span>
              <span>@hu_yifei</span>
              <time>12:48 AM · Jun 17, 2026</time>
            </div>
            <div data-testid="tweetText" lang="en">you call this a technical report?</div>
            <div role="group" aria-label="Post actions">
              <button data-testid="reply">5</button>
              <button data-testid="like">70</button>
              <a href="/hu_yifei/status/2066925930271166549/analytics">24.4K Views</a>
            </div>
          </article>
          <div data-testid="tweetTextarea_0">Post your reply</div>
          <article data-testid="tweet">
            <div data-testid="User-Name">@reply_user · 14h</div>
            <div data-testid="tweetText" lang="en">the sidebar reply should be translated too.</div>
          </article>
        </section>
      </aside>
    `;

    expect(collectTranslationTargets(document.body).map(getTranslationTargetText)).toEqual([
      "you call this a technical report?",
      "the sidebar reply should be translated too.",
    ]);
  });

  it("keeps recommendation and trend sidebars ignored after allowing photo conversation asides", () => {
    document.body.innerHTML = `
      <main role="main">
        <article data-testid="tweet">
          <div data-testid="tweetText" lang="en">Timeline tweet should translate.</div>
        </article>
      </main>
      <aside aria-label="Who to follow">
        <div data-testid="tweetText" lang="en">Suggested user copy should not translate.</div>
      </aside>
      <aside aria-label="Timeline: Trending now">
        <div data-testid="tweetText" lang="en">Trending copy should not translate.</div>
      </aside>
    `;

    expect(collectTranslationTargets(document.body).map(getTranslationTargetText)).toEqual([
      "Timeline tweet should translate.",
    ]);
  });
});
