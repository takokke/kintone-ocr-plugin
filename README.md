# kintone PDF書類　OCR自動入力プラグイン


# Anthropic Messages API only supports text generation.
LangChainを使うとこのようなエラーが起きたため、公式のanthropicライブラリを代用

# Docker コマンド

```
docker build --no-cache -t kintone-ocr:latest .
```

```
docker run -v $(pwd):/app/ -p 8000:8000 kintone-ocr
```