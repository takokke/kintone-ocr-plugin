# app.py
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import logging
import json
import base64
from pydantic import BaseModel
from typing import List, Optional
import tempfile
from dotenv import load_dotenv

# Lambda用のマングラーを追加
from mangum import Mangum

# Anthropicライブラリ
import anthropic

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPIアプリケーションの作成
app = FastAPI(title="PDF請求書解析API")

# CORSミドルウェアの設定（Kintoneからのリクエストを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番環境では特定のドメインに制限することをお勧めします
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lambda環境では.envファイルは使わず、Lambda環境変数から取得する
if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    # Lambda環境の場合は.envファイルを読み込まない
    pass
else:
    # ローカル開発環境の場合は.envファイルを読み込む
    load_dotenv()

# Anthropic APIのキー（環境変数から取得）
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

if not ANTHROPIC_API_KEY:
    logger.error("Anthropic API キーが設定されていません")
    raise ValueError("Anthropic API キーを環境変数 'ANTHROPIC_API_KEY' に設定してください")

# Anthropicクライアント初期化
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# レスポンスモデル
class TransactionItem(BaseModel):
    date: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    amount: Optional[float] = None
    notes: Optional[str] = None

class InvoiceData(BaseModel):
    total_amount: Optional[float] = None
    transactions: List[TransactionItem] = []

@app.post("/analyze-pdf", response_model=InvoiceData)
async def analyze_pdf(pdf_file: UploadFile = File(...)):
    """
    PDFファイルをアップロードして、Anthropic APIを使用して請求書のデータを抽出します。
    """
    if pdf_file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDFファイルのみ対応しています")
    
    try:
        # PDFファイルの内容を読み込む
        pdf_content = await pdf_file.read()
        
        # Base64エンコード
        pdf_base64 = base64.standard_b64encode(pdf_content).decode('utf-8')
        
        # Lambdaでは/tmpディレクトリを使用する
        tmp_dir = "/tmp" if os.environ.get("AWS_LAMBDA_FUNCTION_NAME") else tempfile.gettempdir()
        temp_pdf_path = os.path.join(tmp_dir, f"temp_{pdf_file.filename}")
        
        # 一時ファイルに保存
        with open(temp_pdf_path, "wb") as f:
            f.write(pdf_content)

        logger.info(f"一時PDFファイルを保存: {temp_pdf_path}")
        
        # システムプロンプトの設定
        system_prompt = "あなたはPDF請求書の解析エキスパートです。アップロードされたPDFから以下の情報を抽出してください：" \
                        "1. 請求総額 (total_amount)" \
                        "2. 取引明細の各項目 (transactions): 日付、内容、数量、単価、金額、備考" \
                        "結果はJSON形式で返してください。情報が見つからない場合はnullを返してください。"
        
        # マルチモーダルメッセージの設定
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64", 
                            "media_type": "application/pdf", 
                            "data": pdf_base64
                        }
                    },
                    {
                        "type": "text", 
                        "text": "この請求書PDFを解析し、請求金額と取引明細の情報を抽出してください。JSONフォーマットで返してください。"
                    }
                ]
            }
        ]

        # Anthropic APIを直接呼び出し
        logger.info("AnthropicにPDFを送信して解析を開始します")
        response = client.messages.create(
            model="claude-3-7-sonnet-20250219",
            max_tokens=4000,
            system=system_prompt,
            messages=messages
        )
        
        # レスポンスからコンテンツを取得
        content = response.content[0].text
        logger.info(f"Anthropic APIのレスポンス: {content}")
        
        # JSONの部分を抽出
        try:
            # JSONブロックを検出して抽出
            json_start = content.find('{')
            json_end = content.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_content = content[json_start:json_end]
                invoice_data = json.loads(json_content)
            else:
                # JSONが見つからない場合は全体をパースしてみる
                invoice_data = json.loads(content)
            
            # モデルに合わせてデータを整形
            formatted_data = InvoiceData(
                total_amount=invoice_data.get("total_amount"),
                transactions=[
                    TransactionItem(
                        date=item.get("date"),
                        description=item.get("description"),
                        quantity=item.get("quantity"),
                        unit_price=item.get("unit_price"),
                        amount=item.get("amount"),
                        notes=item.get("notes")
                    ) for item in invoice_data.get("transactions", [])
                ]
            )
            
            # 一時ファイルの削除
            if os.path.exists(temp_pdf_path):
                os.unlink(temp_pdf_path)
                
            return formatted_data
            
        except json.JSONDecodeError as e:
            logger.error(f"JSONのパースに失敗: {e}")
            logger.error(f"解析対象のテキスト: {content}")
            raise HTTPException(status_code=500, detail="請求書データの解析に失敗しました")
            
    except Exception as e:
        logger.error(f"PDFの処理中にエラーが発生: {str(e)}")
        raise HTTPException(status_code=500, detail=f"PDFの処理中にエラーが発生: {str(e)}")

@app.get("/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    return {"status": "healthy"}

# Lambda用ハンドラー
handler = Mangum(app)

# ローカル実行用
if __name__ == "__main__":
    import uvicorn
    # 開発環境でのサーバー起動
    uvicorn.run(app, host="0.0.0.0", port=8000)