<!-- date: 2026-10-17 -->
<!-- source: chat:0ab4d43a-d062-426a-b9d2-8edabe81a964 · user: /plan /grill-me https://share.gemini.google/okLLQSE0Mv6M -->

# Kế hoạch Nâng cấp & Đánh giá ASR Tiếng Nhật (Khắc phục Whisper Turbo trên Âm thanh Nhỏ, Ồn, BGM)

## 1. Mục tiêu & Bối cảnh kỹ thuật
Model mặc định `mlx-community/whisper-large-v3-turbo` trong `local-bridge` gặp hiện tượng rụng từ, mất câu, hoặc ảo giác (hallucination) khi gặp âm thanh tiếng Nhật có âm lượng nhỏ, lẫn tạp âm hoặc có nhạc nền (BGM) lấn át giọng nói. Nguyên nhân cốt lõi:
1. **Kiến trúc model**: Turbo bị cắt giảm từ 32 lớp decoder xuống còn 4 lớp. Khả năng suy luận ngữ cảnh khi tín hiệu âm thanh yếu/nhiễu bị giảm sút nghiêm trọng.
2. **Thiếu tiền xử lý âm thanh**: `local-bridge` truyền thẳng audio giải mã thô vào model mà chưa qua các bộ lọc cân bằng âm lượng động (Dynamic Normalization) hoặc lọc nhiễu dải tần số giọng nói.
3. **Tham số giải mã mặc định khắt khe**: `condition_on_previous_text=True` khiến model dễ rơi vào vòng lặp lặp từ khi gặp BGM; `no_speech_threshold=0.6` tự động vứt bỏ các phân đoạn nói nhỏ/thì thầm.

Kế hoạch giải quyết bằng chiến lược 3 tầng thống nhất:
- **Tầng 1 (Audio DSP Pre-processing)**: Tích hợp filter chain FFmpeg (`highpass=f=100,lowpass=f=8000,afftdn=nf=-25,dynaudnorm=f=150:g=15:p=0.95`) vào `local-bridge` pipeline với toggle `preprocess=True/False`.
- **Tầng 2 (Decoding Parameters Tuning)**: Thiết lập preset tối ưu cho tiếng Nhật trong `mlx_whisper` (`condition_on_previous_text=False`, `no_speech_threshold=0.85`, `logprob_threshold=-1.5`, `initial_prompt`), hỗ trợ client override qua API.
- **Tầng 3 (Model Matrix Benchmark & Selection)**: Đánh giá thực nghiệm so sánh 3 model trên Apple Silicon Metal:
  1. `mlx-community/whisper-large-v3-turbo` (kèm DSP mới).
  2. `kaiinui/kotoba-whisper-v2.0-mlx` (tối ưu tiếng Nhật bản ngữ ReazonSpeech).
  3. `mlx-community/whisper-large-v2-mlx` (32 decoder layers đầy đủ, chống BGM tốt nhất).

---

## 2. Tiêu chí nghiệm thu & Ngân sách hệ thống
- **Chất lượng phiên âm (CER)**: Giảm tỷ lệ lỗi ký tự (Character Error Rate) trên các đoạn âm thanh khó so với YouTube ASR gốc và Whisper Turbo cũ.
- **Ngân sách tính toán**: Real-Time Factor (RTF) $\le 0.5$ (nhanh hơn thời gian thực $\ge 2\times$).
- **Ngân sách bộ nhớ**: Resident Set Size (RSS) $\le 6.0\text{ GB}$, Metal GPU Peak $\le 6.0\text{ GB}$.

---

## 3. Tập dữ liệu kiểm chứng (Evaluation Dataset)
1. **20 Gold Windows**: Sẵn có trong `testdata/audio-gold/manifest.json` (đã bao gồm các ca outro music collision, thì thầm, nói nuốt từ, homophone kanji).
2. **4 Video Thử thách Thực tế do Người dùng Cung cấp**:
   - `qntLSQ9GaO0` & `ufVa8JRLgKo`: Họp báo / Tin tức (tiếng nhỏ xa micro trong hội trường vang).
   - `sCGp-k_lYh0`: VTuber gaming stream (Pekora: BGM game lớn, tiếng thầm / hét / tiếng cười).
   - `zua99_rf8xw`: Phỏng vấn đường phố (tiếng ồn môi trường, BGM phóng sự).

---

## 4. Các tệp tin thêm mới và sửa đổi

### 4.1 `local-bridge`
- **[MODIFY] `local-bridge/app/services/asr.py`**:
  - Thêm `build_audio_filter_chain(filter_profile: str = "enhanced") -> str`.
  - Nâng cấp `decode_audio_bytes(data: bytes, preprocess: bool = True)`.
  - Cập nhật `transcribe_audio` nhận tham số decoding tối ưu (`condition_on_previous_text`, `no_speech_threshold`, `logprob_threshold`, `initial_prompt`, `preprocess`).
- **[MODIFY] `local-bridge/app/api/asr.py`**:
  - Mở rộng endpoint `POST /asr/transcribe` với query params/form fields tương ứng.
- **[NEW] `local-bridge/tests/test_asr_dsp.py`**:
  - Unit tests cho bộ lọc FFmpeg DSP (-30dB amplification, frequency cut, toggle flag).

### 4.2 Scripts & Benchmark Harness
- **[MODIFY] `scripts/asr_benchmark.py`**:
  - Hỗ trợ benchmark ma trận đa model (`--models`) và so sánh trước/sau khi bật DSP (`--compare-dsp`).
- **[NEW] `scripts/slice_real_challenge_audio.py`**:
  - Tool trích xuất audio clip từ 4 video người dùng cung cấp và đưa vào benchmark harness.
