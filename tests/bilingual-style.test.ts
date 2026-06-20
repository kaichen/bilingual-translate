import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SOURCE_KEY_ATTR } from "../entrypoints/main/dom";

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
    style: 5,
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
  options: {
    styles: [
      { value: "underline", label: "下划线系列", disabled: true },
      { value: 5, label: "优雅虚线", class: "bilingual-display-dot-underline", group: "underline" },
    ],
  },
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
  createBilingualContentNode,
  originalContents,
  restoreOriginalContent,
} from "../entrypoints/main/trans";

function cssBlock(selector: string) {
  const css = readFileSync("entrypoints/style.css", "utf8");
  const match = css.match(new RegExp(`${selector.replaceAll(".", "\\.")}\\s*\\{([^}]*)\\}`));
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

describe("bilingual translation text styling", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    originalContents.clear();
  });

  it("puts display styles on the inner text span instead of the translation container", () => {
    const node = createBilingualContentNode("译文内容");

    expect(node.classList.contains("bilingual-translate-bilingual-content")).toBe(true);
    expect(node.classList.contains("bilingual-display-dot-underline")).toBe(false);

    const textNode = node.querySelector(".bilingual-translate-bilingual-text");
    expect(textNode).not.toBeNull();
    expect(textNode?.classList.contains("bilingual-display-dot-underline")).toBe(true);
    expect(textNode?.textContent).toBe("译文内容");
  });

  it("keeps restore cleanup based on the outer translation container", () => {
    document.body.innerHTML = `
      <p data-bt-translated="true" data-bt-node-id="bt-node-1" data-bt-source-key="Original text.">Changed text.</p>
    `;
    originalContents.set("bt-node-1", "Original text.");

    const translationNode = createBilingualContentNode("译文内容");
    translationNode.setAttribute(SOURCE_KEY_ATTR, "Original text.");
    document.body.append(translationNode);

    restoreOriginalContent();

    expect(document.querySelector(".bilingual-translate-bilingual-content")).toBeNull();
    expect(document.querySelector("p")?.textContent).toBe("Original text.");
    expect(originalContents.size).toBe(0);
  });

  it("uses text decoration rather than borders for underline display styles", () => {
    [
      ".bilingual-display-solid-underline",
      ".bilingual-display-dot-underline",
      ".bilingual-display-wavy",
    ].forEach(selector => {
      const block = cssBlock(selector);
      expect(block).toContain("text-decoration-line");
      expect(block).not.toContain("border-bottom");
    });
  });
});
