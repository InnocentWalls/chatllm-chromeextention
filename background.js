// バックグラウンドサービスワーカー
chrome.runtime.onInstalled.addListener(() => {
  console.log('ChatGPT個人情報検知器がインストールされました');
});

// コンテンツスクリプトからのメッセージを処理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getWarningStatus') {
    // 警告状態を取得
    chrome.storage.local.get(['warningDisabledUntil']).then((result) => {
      const isDisabled = result.warningDisabledUntil && Date.now() < result.warningDisabledUntil;
      sendResponse({ isDisabled });
    });
    return true; // 非同期レスポンスを示す
  }
  
  if (request.action === 'disableWarning') {
    // 警告を8時間無効にする
    const disabledUntil = Date.now() + (8 * 60 * 60 * 1000);
    chrome.storage.local.set({ warningDisabledUntil: disabledUntil }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
}); 