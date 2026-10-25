// S-951: repo 안/밖 판정 (순수). \ → / 로 맞추고 대소문자를 무시해 repo 폴더 접두로 본다
export const normPath = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
export const inRepo = (path: string, repo: string): boolean => {
  const n = normPath(path), r = normPath(repo);
  return n === r || n.startsWith(r + "/"); // "/" 까지 봐서 repo2 가 repo 안으로 보이지 않게
};
