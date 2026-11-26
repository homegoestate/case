本資料夾的辨識模型來自 PaddleOCR，由 PaddlePaddle 以 Apache License 2.0 釋出（https://github.com/PaddlePaddle/PaddleOCR）。

快速模式（PP-OCRv5 mobile）
- det-mobile.onnx：文字偵測，取自 https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det_onnx（inference.onnx，未修改）
- rec-mobile.onnx：文字辨識，取自 https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_rec_onnx（inference.onnx，未修改）
- dict.json：rec 模型 inference.yml 內的字典（character_dict）轉存

高精度模式（2026-11-26 起，PP-OCRv6 small 辨識＋PP-OCRv5 mobile 互補）
- rec-v6s.onnx：文字辨識，取自 https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx（inference.onnx，未修改）
  SHA-256 5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634
- dict-v6.json：PP-OCRv6_small_rec_onnx 的 inference.yml 內字典（18,708 字）轉存
- 偵測沿用 det-mobile.onnx；v6 信心不足的文字段再以 rec-mobile.onnx 認一次，取信心較高者。

授權全文見 LICENSE-Apache-2.0.txt。
執行環境 ONNX Runtime Web（MIT 授權）由 cdn.jsdelivr.net 載入。
本作業台只在使用者的瀏覽器內執行辨識，不把影像送到任何辨識服務。
