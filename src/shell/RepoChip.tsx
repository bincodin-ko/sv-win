// S-332: repo chip — 열린 repo / 최근 repo / Open repo
import { useShell } from "./useShell";
import { Menu, MenuHeader, MenuItem } from "./Menu";
import { openRepo, runAppKey, useRepoList } from "./workspaces";
import { useT } from "../i18n";

export default function RepoChip() {
  const t = useT();
  const repos = useRepoList((s) => s.repos);
  const openRepos = useShell((s) => s.openRepos);
  const active = useShell((s) => s.activeRepo);
  const nameOf = (path: string) => repos.find((r) => r.path === path)?.name ?? (path.split(/[\\/]/).filter(Boolean).pop() ?? path);
  const recent = repos.filter((r) => !openRepos.some((o) => o.path === r.path));
  return (
    <Menu testId="repo-chip" label={`${active ? nameOf(active) : t("No repo")} ▾`}>
      {(close) => (
        <>
          {openRepos.length > 0 && <MenuHeader>{t("Open")}</MenuHeader>}
          {openRepos.map((o) => <MenuItem key={o.path} onClick={() => { close(); void openRepo(o.path); }}>{nameOf(o.path)}</MenuItem>)}
          {recent.length > 0 && <MenuHeader>{t("Recent")}</MenuHeader>}
          {recent.map((r) => <MenuItem key={r.path} onClick={() => { close(); void openRepo(r.path); }}>{r.name}</MenuItem>)}
          <MenuItem onClick={() => { close(); void runAppKey("openFolder"); }}>{t("Open repo")}</MenuItem>
        </>
      )}
    </Menu>
  );
}
