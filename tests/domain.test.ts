import { describe, expect, it } from "vitest";
import { getDomainKey } from "../entrypoints/utils/domain";

describe("getDomainKey — 站点 key 归一", () => {
  it("取 hostname、去前导 www、转小写", () => {
    expect(getDomainKey("https://www.Example.com/path?q=1")).toBe("example.com");
    expect(getDomainKey("http://news.ycombinator.com/item?id=1")).toBe("news.ycombinator.com");
    expect(getDomainKey("https://EXAMPLE.COM")).toBe("example.com");
  });

  it("无协议也可解析", () => {
    expect(getDomainKey("github.com/owner/repo")).toBe("github.com");
    expect(getDomainKey("www.google.com")).toBe("google.com");
  });

  it("子域名各自独立（不归并到注册域）", () => {
    expect(getDomainKey("https://docs.python.org/3/")).toBe("docs.python.org");
  });

  it("非法输入返回空串", () => {
    expect(getDomainKey("")).toBe("");
    expect(getDomainKey("   ")).toBe("");
  });
});
