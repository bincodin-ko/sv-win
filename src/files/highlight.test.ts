import { describe, expect, it } from "vitest";
import { langOf, langOfFence, tokenize } from "./highlight";

// S-965: 주석·문자열·숫자·키워드. 모르는 확장자는 plain.
type Lines = ReturnType<typeof tokenize>;
const flat = (l: Lines[number]) => l.map((t) => `${t.type}:${t.text}`);
const has = (lines: Lines, type: string, text: string) => lines.some((l) => l.some((t) => t.type === type && t.text === text));

describe("langOf", () => {
  it("확장자 → 언어", () => {
    const m: Record<string, string> = {
      "a/b.ts": "ts", "x.tsx": "tsx", "x.js": "js", "x.jsx": "jsx", "x.json": "json", "x.rs": "rs", "x.py": "py",
      "x.go": "go", "x.java": "java", "x.c": "c", "x.cpp": "cpp", "x.cs": "cs", "x.css": "css", "x.html": "html",
      "x.sh": "sh", "x.ps1": "ps1", "x.sql": "sql", "x.yaml": "yaml", "x.yml": "yaml", "x.toml": "toml", "x.md": "md",
    };
    for (const [p, l] of Object.entries(m)) expect(langOf(p), p).toBe(l);
    expect(langOf("C:\\dir\\MAIN.TS")).toBe("ts");
  });
  it("모르는 확장자·확장자 없음은 plain", () => {
    expect(langOf("a.xyz")).toBe("plain");
    expect(langOf("Makefile")).toBe("plain");
  });
});

describe("langOfFence", () => {
  it("펜스 언어 이름·별칭 → 언어", () => {
    const m: Record<string, string> = {
      typescript: "ts", TS: "ts", tsx: "tsx", javascript: "js", js: "js", jsx: "jsx", python: "py", py: "py", rust: "rs", rs: "rs",
      shell: "sh", bash: "sh", sh: "sh", zsh: "sh", powershell: "ps1", json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
      html: "html", css: "css", csharp: "cs", "c#": "cs", cs: "cs", go: "go", golang: "go", java: "java", c: "c",
      cpp: "cpp", "c++": "cpp", sql: "sql", markdown: "md", md: "md",
    };
    for (const [n, l] of Object.entries(m)) expect(langOfFence(n), n).toBe(l);
  });
  it("모르는 이름은 plain", () => {
    expect(langOfFence("klingon")).toBe("plain");
    expect(langOfFence("")).toBe("plain");
  });
});

describe("tokenize", () => {
  it("ts: 키워드·문자열·숫자·한 줄 주석", () => {
    const t = tokenize('const x = "hi"; // note\nlet n = 42;', "ts");
    expect(t).toHaveLength(2);
    expect(has(t, "keyword", "const")).toBe(true);
    expect(has(t, "string", '"hi"')).toBe(true);
    expect(has(t, "comment", "// note")).toBe(true);
    expect(has(t, "number", "42")).toBe(true);
  });
  it("줄을 이어 붙이면 원문과 같다(글자 손실 없음)", () => {
    const src = 'fn main() { let s = "a\\"b"; /* c */ 1.5e3 }';
    const t = tokenize(src, "rs");
    expect(t[0].map((x) => x.text).join("")).toBe(src);
  });
  it("여러 줄 주석은 줄 상태를 이어 간다", () => {
    const t = tokenize("a /* x\ny\nz */ b", "c");
    expect(t).toHaveLength(3);
    expect(t[1].every((x) => x.type === "comment")).toBe(true);
    expect(t[2][0]).toEqual({ type: "comment", text: "z */" });
    expect(t[2].at(-1)?.type).toBe("plain");
  });
  it("문자열 안의 // 는 주석이 아니다", () => {
    const t = tokenize('const u = "http://a.b";', "ts");
    expect(has(t, "string", '"http://a.b"')).toBe(true);
    expect(t[0].some((x) => x.type === "comment")).toBe(false);
  });
  it("템플릿 문자열은 여러 줄로 이어진다", () => {
    const t = tokenize("const s = `a\nb // c\nd`; x", "ts");
    expect(t[1].every((x) => x.type === "string")).toBe(true);
    expect(t[2][0].type).toBe("string");
  });
  it("py: # 주석, 삼중따옴표 여러 줄", () => {
    const t = tokenize('def f():\n    """doc\n    more"""  # c\n    return 1', "py");
    expect(has(t, "keyword", "def")).toBe(true);
    expect(t[1].some((x) => x.type === "string")).toBe(true);
    expect(has(t, "comment", "# c")).toBe(true);
    expect(has(t, "number", "1")).toBe(true);
  });
  it("json: 문자열·숫자·true", () => {
    const t = tokenize('{"a": 12, "b": true}', "json");
    expect(has(t, "string", '"a"')).toBe(true);
    expect(has(t, "number", "12")).toBe(true);
    expect(has(t, "keyword", "true")).toBe(true);
  });
  it("식별자 안의 숫자는 숫자가 아니다", () => {
    const t = tokenize("let a1 = b2;", "js");
    expect(t[0].some((x) => x.type === "number")).toBe(false);
  });
  it("sql 키워드는 대소문자 무관, yaml/toml/sh/ps1 은 # 주석", () => {
    expect(has(tokenize("select * from t", "sql"), "keyword", "select")).toBe(true);
    expect(has(tokenize("SELECT 1", "sql"), "keyword", "SELECT")).toBe(true);
    for (const l of ["yaml", "toml", "sh", "ps1"]) expect(has(tokenize("k: v # c", l), "comment", "# c"), l).toBe(true);
  });
  it("css/html 주석", () => {
    expect(has(tokenize("a{} /* c */", "css"), "comment", "/* c */")).toBe(true);
    expect(has(tokenize("<!-- c --><p>", "html"), "comment", "<!-- c -->")).toBe(true);
  });
  it("모르는 언어는 plain 한 덩어리", () => {
    const t = tokenize("const x = 1 // y\nz", "plain");
    expect(t).toHaveLength(2);
    expect(flat(t[0])).toEqual(["plain:const x = 1 // y"]);
  });
  it("빈 입력은 빈 한 줄, 줄 수는 개행 수 + 1(CRLF 도 한 줄)", () => {
    expect(tokenize("", "ts")).toEqual([[]]);
    expect(tokenize("a\r\nb\r\n", "ts")).toHaveLength(3);
  });
  it("5,000줄이 50ms 안에 끝난다", () => {
    const src = Array.from({ length: 5000 }, (_, i) => `const v${i} = "s${i}"; // c ${i} /* x */ 12.5`).join("\n");
    tokenize(src.slice(0, 2000), "ts"); // 예열
    const t0 = performance.now();
    const r = tokenize(src, "ts");
    expect(r).toHaveLength(5000);
    expect(performance.now() - t0).toBeLessThan(50);
  });
  it("아주 긴 한 줄(20만 글자)도 끝난다", () => {
    const t0 = performance.now();
    const r = tokenize("a".repeat(200000) + ' "x', "ts");
    expect(r).toHaveLength(1);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("S-1815 새 언어와 큰 파일", () => {
  it("swift rb kt objc php scss xml 확장자", () => {
    const m: Record<string, string> = { "a.swift": "swift", "a.rb": "rb", "a.kt": "kt", "a.m": "objc", "a.mm": "objc", "a.php": "php", "a.scss": "scss", "a.xml": "xml", "a.svg": "xml" };
    for (const [p, l] of Object.entries(m)) expect(langOf(p), p).toBe(l);
    expect(langOf("a.plist")).toBe("plain");
  });
  it("새 언어마다 주석·문자열·키워드가 칠해진다", () => {
    expect(has(tokenize("func a() { return 1 } // hi", "swift"), "keyword", "func")).toBe(true);
    expect(has(tokenize("def a # hi", "rb"), "comment", "# hi")).toBe(true);
    expect(has(tokenize("fun a() = \"x\"", "kt"), "string", '"x"')).toBe(true);
    expect(has(tokenize("@interface A // c", "objc"), "comment", "// c")).toBe(true);
    expect(has(tokenize("<?php echo 'x'; // c", "php"), "string", "'x'")).toBe(true);
    expect(has(tokenize("a { color: red; } // c", "scss"), "comment", "// c")).toBe(true);
    expect(has(tokenize("<a><!-- c --></a>", "xml"), "comment", "<!-- c -->")).toBe(true);
  });
  it("120,000자를 넘으면 강조를 끈다(줄마다 plain 한 덩어리)", () => {
    const big = "const a = 1;" + String.fromCharCode(10) + "x".repeat(120_000);
    expect(tokenize(big, "ts").every((l) => l.every((t) => t.type === "plain"))).toBe(true);
    expect(has(tokenize("const a = 1;", "ts"), "keyword", "const")).toBe(true);
  });
});
