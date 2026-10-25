// 저사양 모드 켜면 <html data-lowspec> (CSS가 애니메이션·그림자를 끈다)
export function applyLowSpecAttr(on: boolean): void {
  document.documentElement.toggleAttribute("data-lowspec", on);
}
