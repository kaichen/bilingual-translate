import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSiteCompatRule,
  querySiteRuleNodes,
  selectSiteRuleNode,
  type SiteCompatRule,
} from "../entrypoints/main/compat";
import { collectTranslationTargets, grabAllNode, grabNode } from "../entrypoints/main/dom";

vi.mock("@/entrypoints/main/trans", () => ({
  handleBtnTranslation: vi.fn(),
}));

const redditUrl = "https://www.reddit.com/r/ChineseLanguage/comments/11l7b6r/chinese_is_the_easiest_language_in_the_world_and/";

function redditRule(): SiteCompatRule {
  const rule = getSiteCompatRule(redditUrl);
  expect(rule).toBeDefined();
  return rule as SiteCompatRule;
}

function normalizeText(node: Element): string {
  return (node.textContent || "").replace(/\s+/g, " ").trim();
}

function selectedTexts(root: ParentNode = document.body): string[] {
  return querySiteRuleNodes(root as Node, redditRule()).map(normalizeText);
}

describe("Reddit site compatibility rule", () => {
  beforeEach(() => {
    (window as Window & { happyDOM?: { setURL(url: string): void } }).happyDOM?.setURL(redditUrl);
    document.body.innerHTML = "";
  });

  it("keeps post translations aligned with the current Reddit paragraph DOM", () => {
    document.body.innerHTML = `
      <shreddit-post>
        <span slot="credit-bar">u/example</span>
        <h1>Chinese is the easiest language in the world.</h1>
        <shreddit-post-text-body slot="text-body" post-id="t3_example">
          <div class="text-neutral-content" slot="text-body" data-post-click-location="text-body">
            <div class="md text-14-scalable" property="schema:articleBody">
              <p>Chinese doesn't have tenses.</p>
              <p>Comparatives use 更 and 最.</p>
              <blockquote><p>Downsides of Chinese:</p></blockquote>
              <ol>
                <li><p>It doesn't use spaces between words.</p></li>
              </ol>
            </div>
          </div>
        </shreddit-post-text-body>
        <button>137 comments</button>
      </shreddit-post>
    `;

    const nodes = querySiteRuleNodes(document.body, redditRule());
    const texts = nodes.map(normalizeText);
    const textBody = document.querySelector("shreddit-post-text-body") as Element;
    const slotBody = document.querySelector("div[slot='text-body']") as Element;
    const articleBody = document.querySelector("[property='schema:articleBody']") as Element;
    const listItem = document.querySelector("li") as Element;
    const blockquote = document.querySelector("blockquote") as Element;

    expect(texts).toEqual([
      "Chinese is the easiest language in the world.",
      "Chinese doesn't have tenses.",
      "Comparatives use 更 and 最.",
      "Downsides of Chinese:",
      "It doesn't use spaces between words.",
    ]);
    expect(nodes.map(node => node.tagName.toLowerCase())).toEqual(["h1", "p", "p", "p", "p"]);
    expect(nodes).not.toContain(textBody);
    expect(nodes).not.toContain(slotBody);
    expect(nodes).not.toContain(articleBody);
    expect(nodes).not.toContain(listItem);
    expect(nodes).not.toContain(blockquote);
    expect(nodes.some(node => node.tagName.toLowerCase() === "li")).toBe(false);
    expect(nodes.some(node => node.tagName.toLowerCase() === "blockquote")).toBe(false);
    expect(nodes.some(node => node.getAttribute("slot") === "text-body")).toBe(false);
  });

  it("keeps comment translations aligned with paragraph nodes inside comment bodies", () => {
    document.body.innerHTML = `
      <shreddit-comment>
        <div slot="commentMeta"><p>3 years ago</p></div>
        <div slot="comment">
          <div id="t1_comment-post-rtjson-content">
            <p>Overall, I understand your feelings.</p>
            <ol>
              <li><p>Largely, you cannot know how to say a character unless you know it.</p></li>
            </ol>
            <blockquote><p>German can combine words together.</p></blockquote>
          </div>
        </div>
        <shreddit-comment-action-row><p>Reply</p></shreddit-comment-action-row>
      </shreddit-comment>
    `;

    const nodes = querySiteRuleNodes(document.body, redditRule());

    expect(nodes.map(normalizeText)).toEqual([
      "Overall, I understand your feelings.",
      "Largely, you cannot know how to say a character unless you know it.",
      "German can combine words together.",
    ]);
    expect(nodes.every(node => node.tagName.toLowerCase() === "p")).toBe(true);
  });

  it("does not translate Reddit sidebars, ads, metadata, or action controls", () => {
    document.body.innerHTML = `
      <shreddit-post>
        <h1>Post title</h1>
        <div slot="text-body"><p>Post body paragraph.</p></div>
      </shreddit-post>
      <div data-testid="post-container" data-promoted="true">
        <p>Promoted ad text.</p>
      </div>
      <aside data-testid="subreddit-sidebar">
        <p>Community info should not be translated.</p>
      </aside>
      <shreddit-comment>
        <div slot="commentMeta"><p>Comment metadata should not be translated.</p></div>
        <div slot="comment"><p>Comment body paragraph.</p></div>
        <button><p>Reply</p></button>
      </shreddit-comment>
    `;

    expect(selectedTexts()).toEqual([
      "Post title",
      "Post body paragraph.",
      "Comment body paragraph.",
    ]);
  });

  it("selects nested paragraph content instead of outer list or slot containers", () => {
    document.body.innerHTML = `
      <shreddit-comment>
        <div slot="comment">
          <ol>
            <li><p>Nested <strong>comment</strong> paragraph.</p></li>
          </ol>
        </div>
      </shreddit-comment>
    `;

    const rule = redditRule();
    const slot = document.querySelector('[slot="comment"]') as Element;
    const listItem = document.querySelector("li") as Element;
    const paragraph = document.querySelector("p") as Element;
    const strong = document.querySelector("strong") as Element;

    expect(selectSiteRuleNode(slot, rule)).toBe(false);
    expect(selectSiteRuleNode(listItem, rule)).toBe(false);
    expect(selectSiteRuleNode(paragraph, rule)).toBe(paragraph);
    expect(selectSiteRuleNode(strong, rule)).toBe(paragraph);
  });

  it("feeds the DOM-structured Reddit nodes into the actual page scan entrypoints", () => {
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <h1>Post title</h1>
          <shreddit-post-text-body slot="text-body">
            <div class="text-neutral-content" slot="text-body" data-post-click-location="text-body">
              <div class="md text-14-scalable" property="schema:articleBody">
                <p>First post paragraph.</p>
                <p>Second post paragraph.</p>
                <ol>
                  <li><p>Third post paragraph.</p></li>
                </ol>
              </div>
            </div>
          </shreddit-post-text-body>
          <button>Share</button>
        </shreddit-post>
        <shreddit-comment>
          <div slot="commentMeta"><p>3 years ago</p></div>
          <div slot="comment"><p>Visible comment body.</p></div>
        </shreddit-comment>
        <aside><p>Sidebar copy.</p></aside>
      </main>
    `;

    const nodes = grabAllNode(document.body);
    const targets = collectTranslationTargets(document.body);
    const postParagraph = document.querySelector("li p") as Element;
    const listItem = document.querySelector("li") as Element;
    const textBody = document.querySelector("shreddit-post-text-body") as Element;
    const slotBody = document.querySelector("div[slot='text-body']") as Element;

    expect(nodes.map(normalizeText)).toEqual([
      "Post title",
      "First post paragraph.",
      "Second post paragraph.",
      "Third post paragraph.",
      "Visible comment body.",
    ]);
    expect(targets.map(target => target.kind)).toEqual(["element", "element", "element", "element", "element"]);
    expect(grabNode(postParagraph)).toBe(postParagraph);
    expect(grabNode(listItem)).toBe(false);
    expect(grabNode(textBody)).toBe(false);
    expect(grabNode(slotBody)).toBe(false);
  });
});
