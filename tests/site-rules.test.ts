import { beforeEach, describe, expect, it } from "vitest";
import {
  getSiteRule,
  querySiteRuleNodes,
  selectSiteRuleNode,
  siteRules,
  type SiteRule,
} from "../entrypoints/main/site-rules";

// 站点规则注册表迁移的黄金快照：锁定 selectCompatFn → 数据(select[]) + skipNode/replace 逃生舱的等价行为。
// 现有 reddit-compat / x-compat 已覆盖 reddit/x；本文件补迁移改动最大的其余站点。

function ruleFor(url: string): SiteRule {
  const rule = getSiteRule(url);
  expect(rule).toBeDefined();
  return rule as SiteRule;
}

describe("site-rule registry — 注册表数据不变量", () => {
  it("pattern 在所有规则间唯一", () => {
    const patterns = siteRules.map(r => r.pattern);
    expect(patterns.length).toBe(new Set(patterns).size);
  });

  it("迁移新增的纯 selectCompatFn 站点都已进注册表", () => {
    const hosts = siteRules.flatMap(r => r.pattern.split(",").map(s => s.trim()));
    for (const host of ["mvnrepository.com", "aozora.gr.jp", "webtrees.net", "stackoverflow.com", "medium.com"]) {
      expect(hosts).toContain(host);
    }
  });

  it("youtube 保留 replace（译文回填）+ skipNode（控制区跳过）两个逃生舱", () => {
    const yt = getSiteRule("https://www.youtube.com/watch?v=abc");
    expect(typeof yt?.replace).toBe("function");
    expect(typeof yt?.skipNode).toBe("function");
  });

  it("HN / github 保留 skipNode 逃生舱", () => {
    expect(typeof getSiteRule("https://news.ycombinator.com/item?id=1")?.skipNode).toBe("function");
    expect(typeof getSiteRule("https://github.com/owner/repo")?.skipNode).toBe("function");
  });
});

describe("site-rule registry — 纯 selectCompatFn 站点已数据化为 select", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("mvnrepository: div.im-description 经 select 选中", () => {
    const rule = ruleFor("https://mvnrepository.com/artifact/org.foo/bar");
    document.body.innerHTML = `<div class="im-description">A small Java library.</div>`;
    const el = document.querySelector("div.im-description") as Element;
    expect(selectSiteRuleNode(el, rule)).toBe(el);
  });

  it("aozora: div.main_text 经 select 选中", () => {
    const rule = ruleFor("https://www.aozora.gr.jp/cards/000081/files/456.html");
    document.body.innerHTML = `<div class="main_text">青空文庫の本文。</div>`;
    const el = document.querySelector("div.main_text") as Element;
    expect(selectSiteRuleNode(el, rule)).toBe(el);
  });

  it("webtrees: div.kmsg 经 select 选中", () => {
    const rule = ruleFor("https://webtrees.net/index.php");
    document.body.innerHTML = `<div class="kmsg">A genealogy message.</div>`;
    const el = document.querySelector("div.kmsg") as Element;
    expect(selectSiteRuleNode(el, rule)).toBe(el);
  });

  it("stackoverflow: question-hyperlink 经 select 选中", () => {
    const rule = ruleFor("https://stackoverflow.com/questions/123/how-to-center-a-div");
    document.body.innerHTML = `<h1 class="question-hyperlink">How to center a div?</h1>`;
    const el = document.querySelector("h1.question-hyperlink") as Element;
    expect(selectSiteRuleNode(el, rule)).toBe(el);
  });

  it("medium: select 数组按序匹配到段落 p（h1/h2 不中，p 中）", () => {
    const rule = ruleFor("https://medium.com/@author/some-post-abc123");
    document.body.innerHTML = `<p>An article paragraph worth translating.</p>`;
    const p = document.querySelector("p") as Element;
    expect(selectSiteRuleNode(p, rule)).toBe(p);
  });
});

describe("site-rule registry — select[] 按序上卷吸收 findMatchingElement 链", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("HN: 首项命中 .commtext", () => {
    const rule = ruleFor("https://news.ycombinator.com/item?id=1");
    document.body.innerHTML = `<div class="comment"><span class="commtext">A point about scaling.</span></div>`;
    const comm = document.querySelector("span.commtext") as Element;
    expect(selectSiteRuleNode(comm, rule)).toBe(comm);
  });

  it("HN: 旧版选择器经 select 数组后续项命中（td.title a.titlelink）", () => {
    const rule = ruleFor("https://news.ycombinator.com/item?id=1");
    document.body.innerHTML = `<td class="title"><a class="titlelink">Some HN story title</a></td>`;
    const link = document.querySelector("a.titlelink") as Element;
    expect(selectSiteRuleNode(link, rule)).toBe(link);
  });

  it("github: hover 链项 div.comment-body 命中（评论级容器）", () => {
    const rule = ruleFor("https://github.com/owner/repo/issues/1");
    document.body.innerHTML = `<div class="comment-body"><p>This fixes the race condition.</p></div>`;
    const body = document.querySelector("div.comment-body") as Element;
    expect(selectSiteRuleNode(body, rule)).toBe(body);
  });
});

describe("site-rule registry — skipNode 命令式逃生舱", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("HN: 纯按钮文本 flag 经 skipNode 跳过", () => {
    const rule = ruleFor("https://news.ycombinator.com/item?id=1");
    document.body.innerHTML = `<span>flag</span>`;
    const el = document.querySelector("span") as Element;
    expect(selectSiteRuleNode(el, rule)).toEqual({ skip: true });
  });

  it("github: @提及经 skipNode 跳过", () => {
    const rule = ruleFor("https://github.com/owner/repo/issues/1");
    document.body.innerHTML = `<span>@octocat</span>`;
    const el = document.querySelector("span") as Element;
    expect(selectSiteRuleNode(el, rule)).toEqual({ skip: true });
  });

  it("youtube: 观看计数经 skipNode 跳过（仅 skipNode 可捕获，非 ignore/roots）", () => {
    const rule = ruleFor("https://www.youtube.com/watch?v=abc");
    document.body.innerHTML = `<ytd-page-manager><span class="meta">1.2K views</span></ytd-page-manager>`;
    const el = document.querySelector("span.meta") as Element;
    expect(selectSiteRuleNode(el, rule)).toEqual({ skip: true });
  });

  it("youtube: 视频标题经 select 选中（roots 内、未被 skipNode 拦）", () => {
    const rule = ruleFor("https://www.youtube.com/watch?v=abc");
    document.body.innerHTML = `<ytd-page-manager><h1 class="title">Great Video Title</h1></ytd-page-manager>`;
    const el = document.querySelector("h1.title") as Element;
    expect(selectSiteRuleNode(el, rule)).toBe(el);
  });
});

describe("site-rule registry — select 首项约定：全局扫描不泄漏 hover 链", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("github 全局 querySiteRuleNodes 只用 select 首项（段落级），评论级 hover 链不泄漏", () => {
    const rule = ruleFor("https://github.com/owner/repo");
    document.body.innerHTML = `
      <article class="markdown-body"><p>Readme paragraph worth translating.</p></article>
      <div class="comment-body">Comment container direct text.</div>`;
    const texts = querySiteRuleNodes(document.body, rule).map(n => (n.textContent || "").trim());
    expect(texts).toContain("Readme paragraph worth translating.");
    expect(texts).not.toContain("Comment container direct text.");
  });
});
