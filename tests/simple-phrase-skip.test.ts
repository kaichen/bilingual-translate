import { beforeEach, describe, expect, it, vi } from "vitest";
import { grabAllNode, grabNode } from "../entrypoints/main/dom";

vi.mock("@/entrypoints/main/trans", () => ({
  handleBtnTranslation: vi.fn(),
}));

function renderParagraph(text: string): HTMLParagraphElement {
  document.body.innerHTML = "<p></p>";
  const paragraph = document.querySelector("p") as HTMLParagraphElement;
  paragraph.textContent = text;
  return paragraph;
}

describe("simple phrase translation skip rule", () => {
  beforeEach(() => {
    (window as Window & { happyDOM?: { setURL(url: string): void } }).happyDOM?.setURL("https://example.com/article");
    document.body.innerHTML = "";
  });

  it("skips simple phrases after normalizing case, punctuation, and emoji", () => {
    const phrases = [
      "Thanks, you! 🙏",
      "Thank you.",
      "DONE ✅",
      "please!!!",
      "Love this 😍",
      "I LOVE IT 💖",
      "Ridonculous 😂",
    ];

    phrases.forEach(text => {
      const paragraph = renderParagraph(text);

      expect(grabNode(paragraph)).toBe(false);
      expect(grabAllNode(document.body)).toEqual([]);
    });
  });

  it("does not skip longer sentences that merely contain simple phrases", () => {
    const phrases = [
      "Please explain how this works.",
      "I love this approach because it scales.",
      "Done with the first part, now starting the second.",
    ];

    phrases.forEach(text => {
      const paragraph = renderParagraph(text);

      expect(grabNode(paragraph)).toBe(paragraph);
      expect(grabAllNode(document.body)).toEqual([paragraph]);
    });
  });
});
