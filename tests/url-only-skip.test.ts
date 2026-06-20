import { beforeEach, describe, expect, it, vi } from "vitest";
import { grabAllNode, grabNode, isUrlOnly } from "../entrypoints/main/dom";

vi.mock("@/entrypoints/main/trans", () => ({
  handleBtnTranslation: vi.fn(),
}));

function renderParagraph(text: string): HTMLParagraphElement {
  document.body.innerHTML = "<p></p>";
  const paragraph = document.querySelector("p") as HTMLParagraphElement;
  paragraph.textContent = text;
  return paragraph;
}

describe("isUrlOnly — 仅单个 URL 判定", () => {
  it("命中显式 URL（http/https/www，含两端空白）", () => {
    expect(isUrlOnly("https://example.com/path?q=1")).toBe(true);
    expect(isUrlOnly("http://a.b/c")).toBe(true);
    expect(isUrlOnly("www.example.com/x")).toBe(true);
    expect(isUrlOnly("  https://example.com  ")).toBe(true);
  });

  it("不误伤：多 token、句中 URL、裸域名样式词", () => {
    expect(isUrlOnly("see https://example.com now")).toBe(false);
    expect(isUrlOnly("https://example.com 是官网")).toBe(false);
    expect(isUrlOnly("Node.js")).toBe(false);
    expect(isUrlOnly("U.S.A")).toBe(false);
    expect(isUrlOnly("example.com")).toBe(false); // 无显式前缀，不当作 URL
    expect(isUrlOnly("")).toBe(false);
  });
});

describe("仅含单个 URL 的翻译对象被跳过（不生成译文 DOM）", () => {
  beforeEach(() => {
    (window as Window & { happyDOM?: { setURL(url: string): void } }).happyDOM?.setURL("https://example.com/article");
    document.body.innerHTML = "";
  });

  it("整段只有一个 URL → 跳过", () => {
    ["https://example.com/very/long/path", "http://a.io", "www.github.com/owner/repo"].forEach(url => {
      const paragraph = renderParagraph(url);
      expect(grabNode(paragraph)).toBe(false);
      expect(grabAllNode(document.body)).toEqual([]);
    });
  });

  it("URL 出现在句子中 → 仍翻译", () => {
    const paragraph = renderParagraph("The docs are at https://example.com for reference.");
    expect(grabNode(paragraph)).toBe(paragraph);
    expect(grabAllNode(document.body)).toEqual([paragraph]);
  });
});
