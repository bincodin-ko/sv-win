// F1 S-2204: 내려받는 파일의 고정 값 한 곳.
// 2026-10-24 확인: GitHub API releases(v1.9.5 는 자산 없음 → 같은 날 빌드 태그 b5454 의 whisper-bin-x64.zip, digest),
// Hugging Face API tree/main(lfs oid = SHA-256, size). 파일 자체는 받지 않았다(사용자가 켤 때 앱이 받는다).
#[derive(Clone, Debug, PartialEq)]
pub struct Pin {
    pub kind: String,
    pub file: String,
    pub url: String,
    pub bytes: u64,
    pub sha256: String,
}

const PINS: [(&str, &str, &str, u64, &str); 8] = [
    ("engine", "whisper-bin-x64.zip", "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip", 8_928_640, "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb"),
    ("small", "ggml-small.bin", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin", 487_601_967, "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b"),
    ("base", "ggml-base.bin", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin", 147_951_465, "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"),
    // Q1 S-3103: Piper(rhasspy/piper 2023.11.14-2 엔진 + piper-voices 고정 커밋 모델). 값은 spec/12묶음.md 고정 핀 표.
    // 엔진 zip 은 GitHub 가 digest 를 안 줘서 2026-10-25 scratch 에 한 번 받아 certutil 로 쟀다(크기 22477236 일치, 풀거나 실행하지 않음).
    ("piper-engine", "piper_windows_amd64.zip", "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip", 22_477_236, "f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea"),
    ("piper-ko", "ko_KR-kss-medium.onnx", "https://huggingface.co/rhasspy/piper-voices/resolve/5041a7a49ae5b3a0f30e6837769eb03fdbb231bd/ko/ko_KR/kss/medium/ko_KR-kss-medium.onnx", 63_221_984, "624fd774e26895f24bebae1bd9a3379e3394baeade4b584924f83e414096e2c9"),
    ("piper-ko-json", "ko_KR-kss-medium.onnx.json", "https://huggingface.co/rhasspy/piper-voices/resolve/5041a7a49ae5b3a0f30e6837769eb03fdbb231bd/ko/ko_KR/kss/medium/ko_KR-kss-medium.onnx.json", 5_232, "153b5619d0580f824a59108d83ca19434de410eb8e4fe80325b58684fdc8a1df"),
    ("piper-en", "en_US-ljspeech-medium.onnx", "https://huggingface.co/rhasspy/piper-voices/resolve/5041a7a49ae5b3a0f30e6837769eb03fdbb231bd/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx", 63_531_379, "6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22"),
    ("piper-en-json", "en_US-ljspeech-medium.onnx.json", "https://huggingface.co/rhasspy/piper-voices/resolve/5041a7a49ae5b3a0f30e6837769eb03fdbb231bd/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx.json", 4_972, "141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860"),
];

// json 해시는 2026-10-25 같은 URL 에서 받아 certutil 로 직접 쟀다(onnx·엔진도 같은 방법으로 재확인).
pub fn pin(kind: &str) -> Option<Pin> {
    PINS.iter().find(|p| p.0 == kind).map(|&(k, f, u, b, s)| Pin { kind: k.into(), file: f.into(), url: u.into(), bytes: b, sha256: s.into() })
}
