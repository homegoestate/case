本資料夾的辨識模型來自 PaddleOCR（PP-OCRv5 mobile：文字偵測 det、文字辨識 rec 與字典），
由 PaddlePaddle 以 Apache License 2.0 釋出（https://github.com/PaddlePaddle/PaddleOCR）。
ONNX 格式取自 https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det_onnx 與 PP-OCRv5_mobile_rec_onnx，未修改。
dict.json 為 rec 模型 inference.yml 內的字典（character_dict）轉存。
授權全文見 LICENSE-Apache-2.0.txt。
執行環境 ONNX Runtime Web（MIT 授權）由 cdn.jsdelivr.net 載入。
本作業台只在使用者的瀏覽器內執行辨識，不把影像送到任何辨識服務。