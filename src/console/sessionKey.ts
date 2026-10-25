// B2 S-303: 노드 id 로 찾던 것(세션·Resume 제안·복원 표시)의 합성 키 (워크스페이스 id, 노드 id)
// JSON 배열이라 ('a','b:c') 와 ('a:b','c') 가 섞이지 않는다.
export const sessionKey = (wsId: string, nodeId: string): string => JSON.stringify([wsId, nodeId]);
