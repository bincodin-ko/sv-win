// 프런트가 아는 내려받기 크기(값은 src-tauri/src/voice/pins.rs 와 같게). 확인창 문구(S-2202)와 진행률 합치기에 쓴다
export const ENGINE_BYTES = 8_928_640;
export const MODEL_BYTES = { small: 487_601_967, base: 147_951_465 } as const;
/** 엔진 + 모델, 10MB 단위 반올림(small → "470 MB") */
export const sizeLabel = (model: keyof typeof MODEL_BYTES) => `${Math.round((ENGINE_BYTES + MODEL_BYTES[model]) / 2 ** 20 / 10) * 10} MB`;
