import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectTranslationTargets,
  getTranslationTargetText,
  grabAllNode,
  grabTranslationTarget,
  insertTranslationNodeForTarget,
} from "../entrypoints/main/dom";

vi.mock("@/entrypoints/main/trans", () => ({
  handleBtnTranslation: vi.fn(),
}));

const hnUrl = "https://news.ycombinator.com/item?id=48564326";

function renderHNComment() {
  const comment = document.createElement("div");
  comment.className = "hn-comment-text";
  comment.append(document.createTextNode("> OpenRouter even lets you \"block\" or limit your usage to providers that don't train on data."));

  const paragraph = document.createElement("p");
  paragraph.textContent = "More than that, they have various zero data retention options and provide a convenient json list of them.";
  comment.append(paragraph);

  document.body.append(comment);

  return { comment, paragraph };
}

function translationSpan(text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "bilingual-translate-bilingual-content";
  span.textContent = text;
  return span;
}

describe("translation target normalization", () => {
  beforeEach(() => {
    (window as Window & { happyDOM?: { setURL(url: string): void } }).happyDOM?.setURL(hnUrl);
    document.body.innerHTML = "";
  });

  it("splits Hacker News direct comment text from nested paragraph targets", () => {
    const { comment, paragraph } = renderHNComment();

    const targets = collectTranslationTargets(document.body);

    expect(targets.map(target => target.kind)).toEqual(["node-group", "element"]);
    expect(targets.map(getTranslationTargetText)).toEqual([
      "> OpenRouter even lets you \"block\" or limit your usage to providers that don't train on data.",
      "More than that, they have various zero data retention options and provide a convenient json list of them.",
    ]);
    expect(targets.find(target => target.kind === "element" && target.element === comment)).toBeUndefined();
    expect(grabAllNode(document.body)).toEqual([paragraph]);
  });

  it("inserts translations next to each target even when results finish out of order", () => {
    const { comment } = renderHNComment();
    const targets = collectTranslationTargets(document.body);

    insertTranslationNodeForTarget(targets[1], translationSpan("段落译文"));
    insertTranslationNodeForTarget(targets[0], translationSpan("引用译文"));

    expect(Array.from(document.querySelectorAll(".bilingual-translate-bilingual-content")).map(node => node.textContent)).toEqual([
      "引用译文",
      "段落译文",
    ]);
    expect(comment.classList.contains("bilingual-translate-bilingual")).toBe(false);
  });

  it("uses normalized targets for hover selection instead of the overlapping parent", () => {
    const { comment, paragraph } = renderHNComment();

    const commentTarget = grabTranslationTarget(comment);
    const paragraphTarget = grabTranslationTarget(paragraph);

    expect(commentTarget && commentTarget.kind).toBe("node-group");
    expect(paragraphTarget && paragraphTarget.kind).toBe("element");
    expect(paragraphTarget && paragraphTarget.kind === "element" ? paragraphTarget.element : null).toBe(paragraph);
  });

  it("keeps non-X long text guarded by the generic length limit", () => {
    const paragraph = document.createElement("p");
    paragraph.textContent = `Generic article text. ${"Zero data retention options remain available for careful teams. ".repeat(90)}`.trim();
    document.body.append(paragraph);

    expect(paragraph.textContent.length).toBeGreaterThan(4096);
    expect(collectTranslationTargets(document.body)).toEqual([]);
    expect(grabAllNode(document.body)).toEqual([]);
  });
});
