(function() {
  'use strict';
  
  // プロキシサーバーのURL
  const PROXY_API_URL = 'https://i98kcimyza.execute-api.ap-northeast-1.amazonaws.com/analyze-pdf';
  
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
    
    // デバッグ用出力エリアを追加
    const debugOutput = document.createElement('div');
    debugOutput.id = 'debug-output';
    debugOutput.style.marginTop = '15px';
    debugOutput.style.padding = '10px';
    debugOutput.style.backgroundColor = '#f0f0f0';
    debugOutput.style.border = '1px solid #ddd';
    debugOutput.style.borderRadius = '3px';
    debugOutput.style.whiteSpace = 'pre-wrap';
    debugOutput.style.overflow = 'auto';
    debugOutput.style.maxHeight = '300px';
    debugOutput.style.display = 'none';
    
    container.appendChild(heading);
    container.appendChild(fileInput);
    container.appendChild(analyzeButton);
    container.appendChild(statusElement);
    container.appendChild(debugOutput);
    
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
  
  // デバッグ情報を表示する関数
  function showDebugInfo(data) {
    const debugElement = document.getElementById('debug-output');
    if (debugElement) {
      debugElement.style.display = 'block';
      debugElement.innerHTML = '<strong>APIレスポンス詳細:</strong><br>' + 
                              JSON.stringify(data, null, 2);
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
      console.log('APIレスポンス:', data);
      showDebugInfo(data);
      
      updateStatus('PDFの解析が完了しました。データを確認しています...', 'info');
      
      // レスポンスの構造を確認
      if (!data || typeof data !== 'object') {
        throw new Error('APIからの不正なレスポンス形式です');
      }
      
      // トランザクションデータの検証
      if (data.transactions && Array.isArray(data.transactions)) {
        // 有効なトランザクションの確認（少なくとも一つのフィールドに値があるか）
        const validTransactions = data.transactions.filter(transaction => 
          transaction.date || transaction.description || 
          transaction.quantity || transaction.unit_price || 
          transaction.amount || transaction.notes
        );
        
        if (validTransactions.length === 0) {
          updateStatus('有効なトランザクションデータが抽出できませんでした。PDFの形式を確認してください。', 'error');
        } else {
          updateStatus(`${validTransactions.length}件のトランザクションを検出しました。フォームに入力しています...`, 'info');
          fillFormFields(data);
        }
      } else {
        updateStatus('トランザクションデータが見つかりません', 'error');
      }
    })
    .catch(error => {
      console.error('PDFの解析中にエラーが発生しました:', error);
      updateStatus('PDFの解析中にエラーが発生しました: ' + error.message, 'error');
    });
  }
  
  function fillFormFields(data) {
    try {
      const recordObj = kintone.app.record.get();
      const record = recordObj.record;
      
      // デバッグ情報の更新
      showDebugInfo({
        apiResponse: data,
        kintoneRecord: record
      });
      
      // 請求金額フィールドに値を設定
      if (data.total_amount !== null && data.total_amount !== undefined) {
        // 数値を文字列に変換（kintoneの数値フィールド対応）
        record['ご請求金額'].value = String(data.total_amount);
        console.log(`ご請求金額を設定: ${data.total_amount}`);
      }
      
      // 取引テーブルに値を設定
      if (data.transactions && Array.isArray(data.transactions) && data.transactions.length > 0) {
        const tableFieldName = 'テーブル';
        
        console.log(`取引データ処理開始: ${data.transactions.length}件`);
        
        // 有効なトランザクションのみをフィルタリング
        const validTransactions = data.transactions.filter(item => {
          const isValid = item && (
            (item.date !== null && item.date !== undefined) || 
            (item.description !== null && item.description !== undefined) || 
            (item.amount !== null && item.amount !== undefined) || 
            (item.quantity !== null && item.quantity !== undefined) || 
            (item.unit_price !== null && item.unit_price !== undefined) || 
            (item.notes !== null && item.notes !== undefined)
          );
          
          console.log(`トランザクション検証: ${JSON.stringify(item)} -> ${isValid ? '有効' : '無効'}`);
          return isValid;
        });
        
        console.log(`有効なトランザクション: ${validTransactions.length}件`);
        
        if (validTransactions.length === 0) {
          updateStatus('有効なトランザクションデータがありません', 'error');
          return;
        }
        
        // kintoneテーブル用にデータ変換
        const tableData = validTransactions.map((item, index) => {
          console.log(`テーブルデータ作成 #${index}: ${JSON.stringify(item)}`);
          
          return {
            'value': {
              '取引日付': { type: 'SINGLE_LINE_TEXT', value: item.date || '' },
              '内容': { type: 'SINGLE_LINE_TEXT', value : item.description || '' },
              '数量': { type: 'NUMBER', value : item.quantity !== null && item.quantity !== undefined ? String(item.quantity) : '' },
              '単価': { type: 'NUMBER', value : item.unit_price !== null && item.unit_price !== undefined ? String(item.unit_price) : '' },
              '金額': { type: 'NUMBER', value : item.amount !== null && item.amount !== undefined ? String(item.amount) : '' },
              '備考': { type: 'SINGLE_LINE_TEXT', value: item.notes || '' }
            }
          };
        });
        
        // テーブルデータをセット
        console.log(`テーブルデータをセット: ${tableData.length}行`);
        record[tableFieldName].value = tableData;
      } else {
        console.warn('有効なトランザクションデータが見つかりません:', data.transactions);
        updateStatus('トランザクションデータが見つかりません', 'error');
      }
      
      // 更新を反映
      console.log('kintoneレコード更新実行');
      kintone.app.record.set(recordObj);
      updateStatus('データの入力が完了しました。', 'info');
    } catch (error) {
      console.error('フォーム入力中にエラーが発生しました:', error);
      updateStatus('フォーム入力中にエラーが発生しました: ' + error.message, 'error');
      // スタックトレースも表示
      if (error.stack) {
        console.error('エラースタックトレース:', error.stack);
      }
    }
  }
  
  // レコード追加/編集ページの表示イベント
  kintone.events.on(['app.record.create.show', 'app.record.edit.show'], function(event) {
    // PDFアップロード要素をフォームの先頭に追加
    const element = kintone.app.record.getHeaderMenuSpaceElement();
    if (element) {
      element.appendChild(createFileInput());
    }
    return event;
  });
})();