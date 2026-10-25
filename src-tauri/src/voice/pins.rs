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

const PINS: [(&str, &str, &str, u64, &str); 3] = [
    ("engine", "whisper-bin-x64.zip", "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip", 8_928_640, "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb"),
    ("small", "ggml-small.bin", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin", 487_601_967, "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b"),
    ("base", "ggml-base.bin", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin", 147_951_465, "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"),
];

pub fn pin(kind: &str) -> Option<Pin> {
    PINS.iter().find(|p| p.0 == kind).map(|&(k, f, u, b, s)| Pin { kind: k.into(), file: f.into(), url: u.into(), bytes: b, sha256: s.into() })
}
