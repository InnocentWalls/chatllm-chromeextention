// 個人情報検知パターン
const personalInfoPatterns = {
  email: /[a-zA-Z0-9._%+-]+@(?!example\.com\b)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phoneNumber: /(?:0[789]0-\d{4}-\d{4}|0\d{1,4}-\d{1,4}-\d{4}(?!\d)|(?<!\d)0[1-9]\d{8,9}(?!\d))/g,
  creditCard: /(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})/g,
  passportNumber: /[A-Z]{2}\d{7}/g,
  mynumber: /(?<!\d)[1-9]\d{11}(?!\d)/g,
  awsAccessKey: /AKIA[0-9A-Z]{16}/g
};

// 警告を無効にする時間（8時間 = 8 * 60 * 60 * 1000 ms）
const DISABLE_DURATION = 8 * 60 * 60 * 1000;

// 送信許可フラグ（無限ループ防止）
let isSubmissionAllowed = false;

// 警告が無効になっている期間を確認
async function isWarningDisabled() {
  try {
    const result = await chrome.storage.local.get(['warningDisabledUntil']);
    const disabledUntil = result.warningDisabledUntil;
    return disabledUntil && Date.now() < disabledUntil;
  } catch (error) {
    console.error('ストレージアクセスエラー:', error);
    return false;
  }
}

// 警告を8時間無効にする
async function disableWarningFor8Hours() {
  try {
    const disabledUntil = Date.now() + DISABLE_DURATION;
    await chrome.storage.local.set({ warningDisabledUntil: disabledUntil });
  } catch (error) {
    console.error('ストレージ保存エラー:', error);
  }
}

// 個人情報を検知する関数
function detectPersonalInfo(text) {
  const detectedInfo = [];
  
  for (const [type, pattern] of Object.entries(personalInfoPatterns)) {
    const matches = text.match(pattern);
    if (matches) {
      detectedInfo.push({
        type: type,
        matches: matches,
        description: getTypeDescription(type)
      });
    }
  }
  
  return detectedInfo;
}

// 検知タイプの説明を取得
function getTypeDescription(type) {
  const descriptions = {
    email: 'メールアドレス',
    phoneNumber: '電話番号',
    creditCard: 'クレジットカード番号',
    passportNumber: 'パスポート番号',
    mynumber: 'マイナンバー',
    awsAccessKey: 'AWSアクセスキー'
  };
  return descriptions[type] || type;
}

// 警告ダイアログを作成
function createWarningDialog(detectedInfo, originalText) {
  // 既存のダイアログがあれば削除
  const existingDialog = document.getElementById('personal-info-warning');
  if (existingDialog) {
    existingDialog.remove();
  }

  const dialog = document.createElement('div');
  dialog.id = 'personal-info-warning';
  dialog.className = 'personal-info-dialog';
  
  const detectedTypes = detectedInfo.map(info => info.description).join(', ');
  const detectedContent = detectedInfo.map(info => info.matches.join(', ')).join(', ');
  
  dialog.innerHTML = `
    <div class="dialog-overlay">
      <div class="dialog-content">
        <div class="dialog-header">
          <h3>⚠️ 個人情報検知警告</h3>
        </div>
        <div class="dialog-body">
          <p><strong>プロンプトに個人情報の可能性がある内容が検出されました</strong></p>
          <p><strong>検出内容：</strong>${detectedTypes}</p>
          <div class="detected-text">
            <strong>検出されたテキスト：</strong>
            <pre>${detectedContent}</pre>
          </div>
          <p>送信して問題がないかご確認ください。</p>
        </div>
        <div class="dialog-buttons">
          <button class="btn btn-primary" id="continue-btn">はい、送信します</button>
          <button class="btn btn-secondary" id="disable-btn">8時間表示を止める</button>
          <button class="btn btn-cancel" id="cancel-btn">キャンセル</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  // ボタンのイベントリスナー
  document.getElementById('continue-btn').addEventListener('click', () => {
    console.log('ユーザーが「はい、送信します」を選択しました');
    // 送信許可フラグを設定してダイアログを閉じる
    isSubmissionAllowed = true;
    dialog.remove();
    console.log('警告ダイアログを閉じました。元の送信処理が続行されます。');
  });
  
  document.getElementById('disable-btn').addEventListener('click', async () => {
    console.log('ユーザーが「8時間表示を止める」を選択しました');
    await disableWarningFor8Hours();
    // 送信許可フラグを設定してダイアログを閉じる
    isSubmissionAllowed = true;
    dialog.remove();
    console.log('8時間無効化設定完了。警告ダイアログを閉じました。元の送信処理が続行されます。');
  });
  
  document.getElementById('cancel-btn').addEventListener('click', () => {
    dialog.remove();
  });
  
  return dialog;
}

// 元のフォーム送信を実行
function submitOriginalForm() {
  console.log('元の送信処理を実行します');
  
  // 送信許可フラグを設定（無限ループ防止）
  isSubmissionAllowed = true;
  
  // 複数の送信方法を試す
  let submitSuccess = false;
  
  // 方法1: Enterキーイベントを送信
  const currentTextArea = document.querySelector('#prompt-textarea') || 
                         document.querySelector('[contenteditable="true"]');
  
  if (currentTextArea && !submitSuccess) {
    console.log('方法1: Enterキーイベントで送信を試行');
    try {
      currentTextArea.focus();
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      
      // 一時的にフラグを無効にしてEnterイベントを送信
      isSubmissionAllowed = false;
      setTimeout(() => {
        isSubmissionAllowed = true;
        currentTextArea.dispatchEvent(enterEvent);
        console.log('Enterキーイベントを送信しました');
      }, 100);
      
      submitSuccess = true;
    } catch (error) {
      console.log('Enterキー送信エラー:', error);
    }
  }
  
  // 方法2: 送信ボタンを直接クリック
  if (!submitSuccess) {
    console.log('方法2: 送信ボタンのクリックを試行');
    
    if (currentTextArea) {
      // テキストエリアの近くにある送信ボタンを探す
      const parent = currentTextArea.closest('form') || 
                     currentTextArea.parentElement?.parentElement || 
                     currentTextArea.closest('div');
      
      if (parent) {
        const buttons = parent.querySelectorAll('button');
        console.log('見つかったボタン数:', buttons.length);
        
        for (let i = 0; i < buttons.length; i++) {
          const button = buttons[i];
          const ariaLabel = button.getAttribute('aria-label') || '';
          const hasIcon = button.querySelector('svg');
          const isDisabled = button.disabled;
          
          console.log(`ボタン${i}:`, {
            ariaLabel,
            hasIcon: !!hasIcon,
            isDisabled,
            textContent: button.textContent?.trim(),
            className: button.className
          });
          
          if (!ariaLabel.includes('サイドバー') && !ariaLabel.includes('sidebar') && 
              hasIcon && !isDisabled) {
            console.log('送信ボタンを実行:', button);
            
            // 複数の方法でクリックを試行
            try {
              button.click();
              submitSuccess = true;
              console.log('click()メソッドで送信を試行しました');
              break;
            } catch (error) {
              console.log('click()エラー:', error);
            }
            
            // MouseEventでのクリック
            try {
              const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              button.dispatchEvent(clickEvent);
              submitSuccess = true;
              console.log('MouseEventで送信を試行しました');
              break;
            } catch (error) {
              console.log('MouseEventエラー:', error);
            }
          }
        }
      }
    }
  }
  
  // 方法3: フォールバック送信ボタン
  if (!submitSuccess) {
    console.log('方法3: フォールバック送信ボタンを試行');
    const fallbackSelectors = [
      '[data-testid="send-button"]',
      '[data-testid="fruitjuice-send-button"]',
      'button[type="submit"]'
    ];
    
    for (const selector of fallbackSelectors) {
      const sendButton = document.querySelector(selector);
      if (sendButton && !sendButton.disabled) {
        console.log('フォールバック送信ボタンを実行:', sendButton);
        try {
          sendButton.click();
          submitSuccess = true;
          console.log('フォールバック送信が成功しました');
          break;
        } catch (error) {
          console.log('フォールバック送信エラー:', error);
        }
      }
    }
  }
  
  if (!submitSuccess) {
    console.log('すべての送信方法が失敗しました');
    console.log('利用可能なボタン要素をすべて表示:');
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach((btn, index) => {
      console.log(`ボタン${index}:`, {
        element: btn,
        ariaLabel: btn.getAttribute('aria-label'),
        textContent: btn.textContent?.trim(),
        disabled: btn.disabled,
        hasIcon: !!btn.querySelector('svg')
      });
    });
    
    // 送信ボタンが見つからない場合はフラグをリセット
    isSubmissionAllowed = false;
  }
}

// ChatGPTのテキスト入力を監視
function monitorAIServiceInput() {
  const currentService = detectAIService();
  const config = serviceConfigs[currentService];
  
  console.log(`${config?.name || 'AI サービス'}個人情報検知器: 監視を開始します`);
  
  // テキストエリアを取得
  const getTextArea = () => {
    const selectors = config?.textAreaSelectors || [
      'textarea',
      'div[contenteditable="true"]',
      '[role="textbox"]'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log('テキストエリア発見:', selector);
        return element;
      }
    }
    
    // 見つからない場合、すべてのtextareaとcontenteditable要素をデバッグ出力
    console.log('利用可能なtextarea要素:', document.querySelectorAll('textarea'));
    console.log('利用可能なcontenteditable要素:', document.querySelectorAll('[contenteditable="true"]'));
    
    return null;
  };

  // 送信ボタンを取得
  const getSendButton = () => {
    const selectors = config?.sendButtonSelectors || [
      'button[type="submit"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="送信"]',
      '[data-testid="send-button"]'
    ];
    
    // まず特定のセレクターを試す
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log('送信ボタン発見:', selector, element);
        return element;
      }
    }
    
    // 次に、テキストエリアに近いボタンを探す
    const textArea = document.querySelector('#prompt-textarea') || 
                     document.querySelector('textarea') ||
                     document.querySelector('[contenteditable="true"]');
    
    if (textArea) {
      // テキストエリアの親要素内で送信ボタンを探す
      const parent = textArea.closest('form') || textArea.closest('div');
      if (parent) {
        const buttons = parent.querySelectorAll('button');
        for (const button of buttons) {
          // サイドバーボタンなど無関係なボタンを除外
          const ariaLabel = button.getAttribute('aria-label') || '';
          if (ariaLabel.includes('サイドバー') || ariaLabel.includes('sidebar')) {
            continue;
          }
          
          // 送信っぽいボタンを探す
          const hasIcon = button.querySelector('svg');
          const isDisabled = button.disabled;
          
          if (hasIcon && !isDisabled) {
            console.log('送信ボタン候補発見:', button);
            return button;
          }
        }
      }
    }
    
    // 送信ボタンが見つからない場合のデバッグ
    console.log('送信ボタンが見つかりません。利用可能なボタン要素:', document.querySelectorAll('button'));
    
    return null;
  };

  // 入力監視の設定
  function setupInputMonitoring() {
    const textArea = getTextArea();
    const sendButton = getSendButton();
    
    if (!textArea || !sendButton) {
      // 要素が見つからない場合は少し待ってから再試行
      setTimeout(setupInputMonitoring, 1000);
      return;
    }

    let originalSubmitHandler = null;

    // 複数の方法で送信をキャッチ
    const handleSubmit = async (event) => {
      // デバッグ用：handleSubmit呼び出し回数をトラッキング
      if (!window.submitCallCount) window.submitCallCount = 0;
      window.submitCallCount++;
      console.log(`handleSubmit呼び出し #${window.submitCallCount}`, {
        eventType: event.type,
        target: event.target,
        isSubmissionAllowed: isSubmissionAllowed
      });
      
      // 送信が許可されている場合はスルー（イベントを停止せずに通す）
      if (isSubmissionAllowed) {
        console.log('送信が許可されているため、元の処理を続行します');
        isSubmissionAllowed = false; // フラグをリセット
        return; // イベントはそのまま続行される
      }
      
      // 最初に即座にイベントを停止
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      
      console.log('送信処理を一時停止しました');
      
      let inputText = '';
      
      // テキストエリアの内容を取得（ProseMirror対応）
      if (textArea.tagName === 'TEXTAREA') {
        inputText = textArea.value.trim();
      } else if (textArea.contentEditable === 'true') {
        // ProseMirrorの場合、プレースホルダーを除外して実際のテキストを取得
        const paragraphs = textArea.querySelectorAll('p');
        let actualText = '';
        
        for (const p of paragraphs) {
          // プレースホルダーではない実際の入力内容のみを取得
          if (!p.hasAttribute('data-placeholder') || p.textContent.trim()) {
            const pText = p.textContent || p.innerText || '';
            if (pText.trim()) {
              actualText += pText + '\n';
            }
          }
        }
        
        // p要素がない場合は直接テキストを取得
        if (!actualText.trim()) {
          actualText = textArea.textContent || textArea.innerText || '';
        }
        
        inputText = actualText.trim();
        
        console.log('ProseMirror解析:', {
          paragraphs: paragraphs.length,
          actualText: actualText
        });
      } else {
        // その他の方法も試す
        inputText = textArea.value || textArea.textContent || textArea.innerText || '';
        inputText = inputText.trim();
      }
      
      console.log('送信検知:', inputText);
      
      if (!inputText) {
        console.log('テキストが空のため、送信を許可します');
        submitOriginalForm();
        return;
      }

      // 警告が無効になっているかチェック
      if (await isWarningDisabled()) {
        console.log('警告が無効化されているため、送信を許可します');
        submitOriginalForm();
        return;
      }

      // 個人情報を検知
      const detectedInfo = detectPersonalInfo(inputText);
      console.log('個人情報検知詳細:', {
        inputText: inputText,
        detectedInfo: detectedInfo,
        detectedCount: detectedInfo.length
      });
      
      // 各パターンの個別チェック（デバッグ用）
      for (const [type, pattern] of Object.entries(personalInfoPatterns)) {
        const matches = inputText.match(pattern);
        if (matches) {
          console.log(`パターン検知: ${type}`, { pattern: pattern.toString(), matches });
        }
      }
      
      if (detectedInfo.length > 0) {
        console.log('個人情報を検知しました。警告ダイアログを表示します');
        // 警告ダイアログを表示
        createWarningDialog(detectedInfo, inputText);
      } else {
        console.log('個人情報が検知されなかったため、送信を許可します');
        isSubmissionAllowed = true;
        // ダイアログを表示せずに送信続行
      }
    };

    // より早い段階でイベントをキャプチャー
    // 1. document全体での送信ボタンクリックを監視
    document.addEventListener('click', (event) => {
      if (event.target === sendButton || event.target.closest('button') === sendButton) {
        console.log('送信ボタンクリック検知 (document level)');
        handleSubmit(event);
      }
    }, true); // キャプチャーフェーズで実行
    
    // 2. Enterキーを document レベルで監視
    document.addEventListener('keydown', (event) => {
      // テキストエリアにフォーカスがある時のEnterキー
      if (event.key === 'Enter' && !event.shiftKey && 
          (event.target === textArea || textArea.contains(event.target))) {
        console.log('Enterキー送信検知 (document level)');
        // 即座にイベントを処理
        handleSubmit(event);
      }
    }, true); // キャプチャーフェーズで実行
    
    // 3. フォーム送信も監視（バックアップ）
    const form = textArea.closest('form');
    if (form) {
      form.addEventListener('submit', (event) => {
        console.log('フォーム送信検知');
        handleSubmit(event);
      }, true);
    }
    
    // contentEditableの場合は入力イベントも監視
    if (textArea.contentEditable === 'true') {
      textArea.addEventListener('input', () => {
        // ProseMirrorの実際の内容を取得
        const paragraphs = textArea.querySelectorAll('p');
        let currentText = '';
        
        for (const p of paragraphs) {
          if (!p.hasAttribute('data-placeholder') || p.textContent.trim()) {
            const pText = p.textContent || p.innerText || '';
            if (pText.trim()) {
              currentText += pText + ' ';
            }
          }
        }
        
        console.log('入力検知 (ProseMirror):', currentText.trim());
      });
    }

    console.log('ChatGPT個人情報検知器が初期化されました');
  }

  setupInputMonitoring();
}

// バナーを閉じたかどうかのフラグ
let isBannerClosed = false;

// 現在のサービスを検出
function detectAIService() {
  const hostname = window.location.hostname;
  if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
    return 'chatgpt';
  } else if (hostname.includes('claude.ai')) {
    return 'claude';
  } else if (hostname.includes('gemini.google.com')) {
    return 'gemini';
  }
  return 'unknown';
}

// サービス固有の設定
const serviceConfigs = {
  chatgpt: {
    name: 'ChatGPT',
    textAreaSelectors: [
      '#prompt-textarea',
      'textarea[placeholder*="メッセージ"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Send a message"]',
      'div[contenteditable="true"]',
      'textarea',
      '[contenteditable="true"]',
      'div[role="textbox"]',
      '[data-testid="textbox"]'
    ],
    sendButtonSelectors: [
      '[data-testid="send-button"]',
      '[data-testid="fruitjuice-send-button"]',
      'button[type="submit"]',
      'button[aria-label*="送信"]',
      'button[aria-label*="Send"]',
      'button[title*="Send message"]'
    ]
  },
  claude: {
    name: 'Claude',
    textAreaSelectors: [
      'div[contenteditable="true"]',
      'textarea',
      '[role="textbox"]',
      '[data-testid="chat-input"]',
      '.ProseMirror'
    ],
    sendButtonSelectors: [
      'button[aria-label*="Send"]',
      'button[aria-label*="送信"]',
      '[data-testid="send-button"]',
      'button[type="submit"]'
    ]
  },
  gemini: {
    name: 'Gemini',
    textAreaSelectors: [
      'div[contenteditable="true"]',
      'textarea',
      '[role="textbox"]',
      '.ql-editor',
      '[data-testid="input-area"]'
    ],
    sendButtonSelectors: [
      'button[aria-label*="Send"]',
      'button[aria-label*="送信"]',
      '[data-testid="send-button"]',
      'button[type="submit"]'
    ]
  }
};

// 注意喚起バナーを表示
function createWarningBanner() {
  // ユーザーがバナーを閉じている場合は表示しない
  if (isBannerClosed) {
    console.log('ユーザーがバナーを閉じているため、表示しません');
    return;
  }

  // 既存のバナーがあれば削除
  const existingBanner = document.getElementById('ai-usage-warning-banner');
  if (existingBanner) {
    existingBanner.remove();
  }

  // 現在のサービスを検出
  const currentService = detectAIService();
  const serviceName = serviceConfigs[currentService]?.name || 'AI サービス';

  const banner = document.createElement('div');
  banner.id = 'ai-usage-warning-banner';
  banner.className = 'ai-warning-banner';
  
  banner.innerHTML = `
    <div class="warning-content">
      <div class="warning-icon">❗</div>
      <div class="warning-text">
        <strong>生成AI利活用ガイドラインに基づき（${serviceName}使用時）</strong><br>
        ・漏洩により他社等の社外から責任を問われる情報（個人情報、お客様情報など）<br>
        ・漏洩により当社が甚大な損害を被りうる情報（クラウドのアクセスキーなど）<br>
        を入力する前には、必ずCorp-ITと法務チーム、および所属上長に相談してください
      </div>
      <button class="warning-close">×</button>
    </div>
  `;

  // ページの最上部に挿入
  document.body.insertBefore(banner, document.body.firstChild);
  
  // バツボタンのイベントリスナーを追加
  const closeButton = banner.querySelector('.warning-close');
  closeButton.addEventListener('click', () => {
    console.log('警告バナーを閉じます');
    isBannerClosed = true; // フラグを設定
    banner.style.display = 'none';
    // さらに確実に削除
    setTimeout(() => {
      if (banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
    }, 100);
  });
  
  console.log('AI利活用ガイドライン警告バナーを表示しました');
}

// DOM読み込み完了後に監視開始
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    createWarningBanner();
    monitorAIServiceInput();
  });
} else {
  createWarningBanner();
  monitorAIServiceInput();
}

// ページの動的変更に対応（ChatGPTはSPAなので）
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.addedNodes.length > 0) {
      // 警告バナーが消されていないかチェック（ユーザーが閉じていない場合のみ）
      const warningBanner = document.getElementById('ai-usage-warning-banner');
      if (!warningBanner && !isBannerClosed) {
        console.log('警告バナーが見つからないため、再表示します');
        setTimeout(createWarningBanner, 100);
      }
      
      // 送信ボタンが動的に追加される場合に対応
      const sendButton = document.querySelector('[data-testid="send-button"]');
      if (sendButton && !sendButton.dataset.monitored) {
        console.log('動的に送信ボタンが追加されました');
        sendButton.dataset.monitored = 'true';
        setTimeout(monitorAIServiceInput, 500);
      }
      
      // 新しいテキストエリアが追加された場合も対応
      const textArea = document.querySelector('#prompt-textarea') ||
                     document.querySelector('textarea') ||
                     document.querySelector('[contenteditable="true"]');
      
      if (textArea && !textArea.dataset.monitored) {
        console.log('動的にテキストエリアが追加されました');
        textArea.dataset.monitored = 'true';
        setTimeout(monitorAIServiceInput, 500);
      }
    }
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true
}); 