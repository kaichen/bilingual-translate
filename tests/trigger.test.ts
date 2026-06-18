import { describe, expect, it } from "vitest";
import { parseHoverHotkey, eventMainKeyToken, isHoverMatch } from "../entrypoints/utils/trigger";

// 悬停触发纯逻辑（从 content.ts 提取）的单测。trigger.ts 不 import config，故可直接 import 测试。

const evt = (key: string, code = ""): KeyboardEvent => ({ key, code } as KeyboardEvent);

describe("parseHoverHotkey — 配置 → 期望键集", () => {
  it("纯修饰键悬停（默认 Control / Alt）", () => {
    expect(parseHoverHotkey("Control", "")).toEqual(["control"]);
    expect(parseHoverHotkey("Alt", "")).toEqual(["alt"]);
  });

  it("禁用 / 空 → 空数组", () => {
    expect(parseHoverHotkey("none", "")).toEqual([]);
    expect(parseHoverHotkey("", "")).toEqual([]);
    expect(parseHoverHotkey("custom", "")).toEqual([]);
  });

  it("custom 走 customHotkey，组合键拆分并归一 ctrl→control", () => {
    expect(parseHoverHotkey("custom", "Alt+T")).toEqual(["alt", "t"]);
    expect(parseHoverHotkey("custom", "Ctrl+Shift+A")).toEqual(["control", "shift", "a"]);
  });
});

describe("eventMainKeyToken — 提取主键 token（合并自两张 specialKeys 表）", () => {
  it("字母键走 code（大小写无关）", () => {
    expect(eventMainKeyToken(evt("t", "KeyT"))).toBe("t");
    expect(eventMainKeyToken(evt("T", "KeyT"))).toBe("t");
  });

  it("功能键 / 特殊键 / 单字符符号", () => {
    expect(eventMainKeyToken(evt("F9", "F9"))).toBe("f9");
    expect(eventMainKeyToken(evt("Escape", "Escape"))).toBe("escape");
    expect(eventMainKeyToken(evt("ArrowUp", "ArrowUp"))).toBe("arrowup");
    expect(eventMainKeyToken(evt("/", "Slash"))).toBe("/");
  });

  it("修饰键不作为主键（返回 null）—— 保证纯修饰键悬停只靠修饰键集匹配", () => {
    expect(eventMainKeyToken(evt("Alt", "AltLeft"))).toBeNull();
    expect(eventMainKeyToken(evt("Control", "ControlLeft"))).toBeNull();
    expect(eventMainKeyToken(evt("Shift", "ShiftLeft"))).toBeNull();
  });
});

describe("isHoverMatch — 当前键集精确匹配配置", () => {
  it("纯修饰键 / 组合键命中", () => {
    expect(isHoverMatch(new Set(["control"]), ["control"])).toBe(true);
    expect(isHoverMatch(new Set(["alt", "t"]), ["alt", "t"])).toBe(true);
  });

  it("多按一个键 → 不匹配（精确，不多不少）", () => {
    expect(isHoverMatch(new Set(["control", "t"]), ["control"])).toBe(false);
  });

  it("少按一个键 → 不匹配", () => {
    expect(isHoverMatch(new Set(["control"]), ["control", "t"])).toBe(false);
  });

  it("空配置（禁用）恒不匹配", () => {
    expect(isHoverMatch(new Set(["control"]), [])).toBe(false);
    expect(isHoverMatch(new Set(), [])).toBe(false);
  });
});
