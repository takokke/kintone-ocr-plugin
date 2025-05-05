FROM python:3.11-slim

WORKDIR /app

# 依存関係のインストール
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションのコピー
COPY main.py .

# ポートの公開
EXPOSE 8000

# 環境変数の設定（APIキーはDockerfileには記載せず、環境変数または.envファイルから読み込む）
ENV PYTHONUNBUFFERED=1

# アプリケーションの実行
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]