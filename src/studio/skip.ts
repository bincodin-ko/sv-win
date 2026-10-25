// 5묶음 E1 S-1814: 건너뛰는 폴더·숨기는 파일 (Rust studio.rs 와 같은 표)
const SKIP = new Set(["node_modules", "build", "dist", "venv", "target", "vendor", "coverage", "DerivedData", "Pods", "__pycache__", "out", "bin", "obj"]);
const KEEP = new Set([".gitignore", ".gitattributes", ".env.example", ".editorconfig", ".prettierrc", ".nvmrc", ".dockerignore"]);
/** 점(.)으로 시작하는 폴더(.git .next .venv .gradle .idea .vs .cache .turbo …)는 전부 건너뛴다 */
export const skipDir = (name: string): boolean => name.startsWith(".") || SKIP.has(name);
/** 점 파일은 숨기되 쓸모 있는 7개는 보인다 */
export const showFile = (name: string): boolean => !name.startsWith(".") || KEEP.has(name);
