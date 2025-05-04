(function() {
  'use strict';
  
  // プロキシサーバーのURL
  const PROXY_API_URL = 'https://your-fastapi-server.com/analyze-pdf';
  
  // PDFを読み込むための入力要素を作成する関数
  function createFileInput() {
    const container = document.createElement('div');
    container.style.margin = '20px 0';
    container.style.padding = '15px';
    container.style.border = '1px dashed #ccc';
    container.style.borderRadius = '5px';
    container.style.backgroundColor = '#f9f9f9';
    
    const heading = document.createElement('h3');
    heading.textContent = '請求書PDFの解析';
    heading.style.marginTop = '0';
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/pdf';
    fileInput.id = 'pdf-file-input';
    
    const analyzeButton = document.createElement('button');
    analyzeButton.textContent = 'PDFを解析する';
    analyzeButton.style.marginLeft = '10px';
    analyzeButton.style.padding = '5px 15px';
    analyzeButton.style.backgroundColor = '#4b4b4b';
    analyzeButton.style.color = '#fff';
    analyzeButton.style.border = 'none';
    analyzeButton.style.borderRadius = '3px';
    analyzeButton.style.cursor = 'pointer';
    
    const statusElement = document.createElement('div');
    statusElement.id = 'analysis-status';
    statusElement.style.marginTop = '10px';
    statusElement.style.color = '#666';
    
    container.appendChild(heading);
    container.appendChild(fileInput);
    container.appendChild(analyzeButton);
    container.appendChild(statusElement);
    
    analyzeButton.addEventListener('click', () => {
      const fileInput = document.getElementById('pdf-file-input');
      if (fileInput.files.length > 0) {
        analyzePdf(fileInput.files[0]);
      } else {
        updateStatus('PDFファイルを選択してください', 'error');
      }
    });
    
    return container;
  }
  
  // ステータスメッセージを更新する関数
  function updateStatus(message, type = 'info') {
    const statusElement = document.getElementById('analysis-status');
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.style.color = type === 'error' ? '#e74c3c' : '#3498db';
    }
  }
  
  // PDFを解析する関数
  function analyzePdf(file) {
    updateStatus('PDFの解析を開始しています...', 'info');
    
    // FormDataオブジェクトを作成
    const formData = new FormData();
    formData.append('pdf_file', file);
    
    // APIリクエストの送信
    fetch(PROXY_API_URL, {
      method: 'POST',
      body: formData
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('APIレスポンスエラー: ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      updateStatus('PDFの解析が完了しました。データを入力しています...', 'info');
      fillFormFields(data);
    })
    .catch(error => {
      console.error('PDFの解析中にエラーが発生しました:', error);
      updateStatus('PDFの解析中にエラーが発生しました: ' + error.message, 'error');
    });
  }
  
  // フォームフィールドにデータを入力する関数
  function fillFormFields(data) {
    try {
      // 請求金額フィールドに値を設定
      if (data.total_amount) {
        kintone.app.record.set({
          'field': {
            '請求金額': {
              'value': data.total_amount
            }
          }
        });
      }
      
      // 取引テーブルに値を設定
      if (data.transactions && data.transactions.length > 0) {
        // 既存のテーブル行を取得
        const record = kintone.app.record.get();
        const tableFieldName = '取引テーブル';
        
        // テーブルデータを準備
        const tableData = data.transactions.map(item => {
          return {
            'value': {
              '取引日付': {
                'value': item.date || ''
              },
              '内容': {
                'value': item.description || ''
              },
              '数量': {
                'value': item.quantity || ''
              },
              '単価': {
                'value': item.unit_price || ''
              },
              '金額': {
                'value': item.amount || ''
              },
              '備考': {
                'value': item.notes || ''
              }
            }
          };
        });
        
        // テーブルデータを設定
        kintone.app.record.set({
          'field': {
            [tableFieldName]: {
              'value': tableData
            }
          }
        });
      }
      
      updateStatus('データの入力が完了しました。', 'info');
    } catch (error) {
      console.error('フォーム入力中にエラーが発生しました:', error);
      updateStatus('フォーム入力中にエラーが発生しました: ' + error.message, 'error');
    }
  }
  
  // レコード追加/編集ページの表示イベント
  kintone.events.on(['app.record.create.show', 'app.record.edit.show'], function(event) {
    // PDFアップロード要素をフォームの先頭に追加
    const element = kintone.app.record.getHeaderMenuSpaceElement();
  //   const record = kintone.app.record.getSpaceElement('pdf_upload_space');
    if (element) {
      element.appendChild(createFileInput());
    }
    return event;
  });
})();