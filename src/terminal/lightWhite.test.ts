import { expect, test } from "vitest";
import { lightenWhite } from "./lightWhite";

const enc = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const dec = (b: Uint8Array) => String.fromCharCode(...b);

test("흰 글자색만 진하게, 배경·다른 색·한글 바이트는 그대로", () => {
  expect(dec(lightenWhite(enc("\x1b[38;2;255;255;255mA\x1b[1;38;2;240;240;240mB")))).toBe("\x1b[38;2;29;27;22mA\x1b[1;38;2;29;27;22mB");
  expect(dec(lightenWhite(enc("\x1b[48;2;255;255;255m\x1b[38;2;153;153;153mC")))).toBe("\x1b[48;2;255;255;255m\x1b[38;2;153;153;153mC");
  const ko = new TextEncoder().encode("\x1b[38;2;255;255;255m안녕");
  expect(new TextDecoder().decode(lightenWhite(ko))).toBe("\x1b[38;2;29;27;22m안녕");
});
