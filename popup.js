// ポップアップのJavaScript

document.addEventListener('DOMContentLoaded', function() {
  updateStatus();
  
  // 警告を無効にするボタン
  document.getElementById('disable-warning-btn').addEventListener('click', function() {
    disableWarningFor8Hours();
  });
  
  // 警告を有効にするボタン
  document.getElementById('enable-warning-btn').addEventListener('click', function() {
    enableWarning();
  });
});

// ステータス更新
async function updateStatus() {
  try {
    // 現在のタブがChatGPTかどうか確認
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    const isChatGPT = currentTab && (
      currentTab.url.includes('chat.openai.com') || 
      currentTab.url.includes('chatgpt.com')
    );
    
    const monitoringStatus = document.getElementById('monitoring-status');
    if (isChatGPT) {
      monitoringStatus.textContent = '監視中';
      monitoringStatus.className = 'status-value status-enabled';
    } else {
      monitoringStatus.textContent = '対象外のページ';
      monitoringStatus.className = 'status-value status-disabled';
    }
    
    // 警告状態を確認
    const result = await chrome.storage.local.get(['warningDisabledUntil']);
    const warningStatus = document.getElementById('warning-status');
    const disableTimeItem = document.getElementById('disable-time-item');
    const disableTime = document.getElementById('disable-time');
    const enableBtn = document.getElementById('enable-warning-btn');
    const disableBtn = document.getElementById('disable-warning-btn');
    
    if (result.warningDisabledUntil && Date.now() < result.warningDisabledUntil) {
      // 警告が無効な状態
      warningStatus.textContent = '無効（8時間）';
      warningStatus.className = 'status-value status-disabled';
      
      const endTime = new Date(result.warningDisabledUntil);
      disableTime.textContent = endTime.toLocaleString('ja-JP');
      disableTimeItem.style.display = 'flex';
      
      enableBtn.style.display = 'block';
      disableBtn.style.display = 'none';
    } else {
      // 警告が有効な状態
      warningStatus.textContent = '有効';
      warningStatus.className = 'status-value status-enabled';
      
      disableTimeItem.style.display = 'none';
      enableBtn.style.display = 'none';
      disableBtn.style.display = 'block';
    }
  } catch (error) {
    console.error('ステータス更新エラー:', error);
  }
}

// 警告を8時間無効にする
async function disableWarningFor8Hours() {
  try {
    const disabledUntil = Date.now() + (8 * 60 * 60 * 1000);
    await chrome.storage.local.set({ warningDisabledUntil: disabledUntil });
    updateStatus();
    
    // 通知
    showNotification('警告表示を8時間無効にしました');
  } catch (error) {
    console.error('警告無効化エラー:', error);
    showNotification('エラーが発生しました', true);
  }
}

// 警告を有効にする
async function enableWarning() {
  try {
    await chrome.storage.local.remove(['warningDisabledUntil']);
    updateStatus();
    
    // 通知
    showNotification('警告表示を有効にしました');
  } catch (error) {
    console.error('警告有効化エラー:', error);
    showNotification('エラーが発生しました', true);
  }
}

// 通知表示
function showNotification(message, isError = false) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: ${isError ? '#d73502' : '#10a37f'};
    color: white;
    padding: 10px 15px;
    border-radius: 6px;
    font-size: 12px;
    z-index: 1000;
    animation: slideInRight 0.3s ease-out;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
} 