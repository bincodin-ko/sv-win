// 5묶음 E1 S-1811: 편집 중인 글을 잠깐 쉬면(기본 0.8초) 초안으로 남긴다. 저장하거나 버리면 clear. 앱이 갑자기 꺼져도 초안은 남는다(draftGet 으로 복구).
import { draftClear, draftPut } from "../lib/ipc";

export function draftSaver(path: string, getText: () => string, getBaseMtime: () => number, delay = 800) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => { clearTimeout(timer); timer = undefined; return draftPut(path, getText(), getBaseMtime()); };
  return {
    /** 글이 바뀔 때마다 부른다 */
    schedule: () => { clearTimeout(timer); timer = setTimeout(() => void flush(), delay); },
    flush,
    /** 저장했거나 버렸다 */
    clear: () => { clearTimeout(timer); timer = undefined; return draftClear(path); },
  };
}
