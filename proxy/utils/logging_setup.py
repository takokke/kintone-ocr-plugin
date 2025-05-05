"""
ロギング設定
"""
import logging
import sys

def setup_logging():
    """
    アプリケーション全体のロギング設定を行う
    
    Returns:
        logging.Logger: 設定済みのロガー
    """
    # ロギング設定の強化 これがないと、ログとして出力されなかった
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        force=True,  # 既存のロギング設定を上書き
        handlers=[
            logging.StreamHandler(sys.stdout)  # 明示的に標準出力へ送信
        ]
    )
    
    logger = logging.getLogger(__name__)
    
    # Lambda環境でのロギング設定を確保
    for handler in logger.handlers:
        handler.setLevel(logging.INFO)
        
    # ルートロガーにもハンドラを追加
    root_logger = logging.getLogger()
    if not root_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.INFO)
        root_logger.addHandler(handler)
    
    return logger