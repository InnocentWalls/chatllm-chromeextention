// ===== 設定と定数 =====
const PERSONAL_INFO_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@(?!example\.com\b)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phoneNumber: /(?:0[789]0-\d{4}-\d{4}|0\d{1,4}-\d{1,4}-\d{4}(?!\d)|(?<!\d)0[1-9]\d{8,9}(?!\d))/g,
  creditCard: /(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})/g,
  passportNumber: /[A-Z]{2}\d{7}/g,
  mynumber: /(?<!\d)[1-9]\d{11}(?!\d)/g,
  awsAccessKey: /AKIA[0-9A-Z]{16}/g
};

const DISABLE_DURATION = 8 * 60 * 60 * 1000; // 8時間
const TYPE_DESCRIPTIONS = {
  email: 'メールアドレス',
  phoneNumber: '電話番号',
  creditCard: 'クレジットカード番号',
  passportNumber: 'パスポート番号',
  mynumber: 'マイナンバー',
  awsAccessKey: 'AWSアクセスキー'
};

const SERVICE_CONFIGS = {
  chatgpt: {
    name: 'ChatGPT',
    domains: ['chat.openai.com', 'chatgpt.com'],
    textAreaSelectors: ['#prompt-textarea', 'textarea', 'div[contenteditable="true"]'],
    sendButtonSelectors: ['[data-testid="send-button"]', '[data-testid="fruitjuice-send-button"]'],
    keySubmit: true
  },
  claude: {
    name: 'Claude',
    domains: ['claude.ai'],
    textAreaSelectors: [
      'div[contenteditable="true"]',
      '.ProseMirror',
      '[data-testid="chat-input"]',
      'div[role="textbox"]',
      'textarea',
      '[contenteditable="true"]'
    ],
    sendButtonSelectors: [
      'button[aria-label*="Send Message"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="送信"]',
      'button[type="submit"]',
      'button:has(svg)',
      '[data-testid="send-button"]',
      'button[data-testid*="send"]',
      'button[title*="Send"]',
      'button[title*="送信"]',
      'button[class*="send"]',
      'button[class*="Send"]',
      'form button[type="submit"]',
      'form button:last-child',
      'div[role="form"] button',
      'button svg[data-icon*="send"]',
      'button svg[data-icon*="arrow"]'
    ],
    keySubmit: true,
    specialHandling: true
  },
  gemini: {
    name: 'Gemini',
    domains: ['gemini.google.com'],
    textAreaSelectors: ['div[contenteditable="true"]', 'textarea'],
    sendButtonSelectors: ['button[aria-label*="Send"]', 'button[type="submit"]'],
    keySubmit: true
  }
};

// ===== グローバル状態 =====
let currentDialog = null;
let pendingSubmission = null;
let isProcessingSubmission = false;
let debugMode = true; // デバッグモード有効
let warningDisabledUntil = 0; // ローカルストレージ代替

// ===== デバッグ用ログ関数 =====
function debugLog(message, data = null) {
  if (debugMode) {
    console.log(`[個人情報検知器] ${message}`, data || '');
  }
}

// ===== ユーティリティ関数 =====
class PersonalInfoDetector {
  static async isWarningDisabled() {
    try {
      // Chrome拡張機能のストレージが利用可能かチェック
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get(['warningDisabledUntil']);
        return result.warningDisabledUntil && Date.now() < result.warningDisabledUntil;
      } else {
        // フォールバック: グローバル変数を使用
        return warningDisabledUntil && Date.now() < warningDisabledUntil;
      }
    } catch (error) {
      debugLog('ストレージアクセスエラー（フォールバックを使用）', error.message);
      return warningDisabledUntil && Date.now() < warningDisabledUntil;
    }
  }

  static async disableWarningFor8Hours() {
    try {
      const disabledUntil = Date.now() + DISABLE_DURATION;
      
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ warningDisabledUntil: disabledUntil });
      } else {
        // フォールバック: グローバル変数を使用
        warningDisabledUntil = disabledUntil;
      }
      
      debugLog('8時間無効化設定完了', { disabledUntil });
    } catch (error) {
      debugLog('ストレージ保存エラー（フォールバックを使用）', error.message);
      warningDisabledUntil = Date.now() + DISABLE_DURATION;
    }
  }

  static detectPersonalInfo(text) {
    if (!text || text.trim().length === 0) return [];
    
    const detectedInfo = [];
    
    for (const [type, pattern] of Object.entries(PERSONAL_INFO_PATTERNS)) {
      const matches = text.match(pattern);
      if (matches) {
        detectedInfo.push({
          type,
          matches,
          description: TYPE_DESCRIPTIONS[type] || type
        });
      }
    }
    
    return detectedInfo;
  }

  static extractTextFromElement(element) {
    if (!element) return '';
    
    debugLog('テキスト抽出開始', {
      tagName: element.tagName,
      contentEditable: element.contentEditable,
      className: element.className
    });
    
    if (element.tagName === 'TEXTAREA') {
      return element.value || '';
    }
    
    if (element.contentEditable === 'true') {
      // ProseMirrorエディタ対応（Claude用）
      const paragraphs = element.querySelectorAll('p');
      let text = '';
      
      for (const p of paragraphs) {
        if (!p.hasAttribute('data-placeholder') || p.textContent.trim()) {
          text += (p.textContent || p.innerText || '') + '\n';
        }
      }
      
      const extractedText = text.trim() || element.textContent || element.innerText || '';
      debugLog('ProseMirrorテキスト抽出完了', { 
        paragraphCount: paragraphs.length,
        extractedLength: extractedText.length,
        preview: extractedText.substring(0, 100)
      });
      
      return extractedText;
    }
    
    return element.textContent || element.innerText || '';
  }
}

// ===== ダイアログ管理 =====
class WarningDialog {
  constructor(detectedInfo, onContinue, onDisable, onCancel) {
    this.detectedInfo = detectedInfo;
    this.onContinue = onContinue;
    this.onDisable = onDisable;
    this.onCancel = onCancel;
    this.element = null;
  }

  create() {
    this.remove(); // 既存のダイアログを削除
    
    const dialog = document.createElement('div');
    dialog.id = 'personal-info-warning';
    dialog.className = 'personal-info-dialog';
    
    const detectedTypes = this.detectedInfo.map(info => info.description).join(', ');
    const detectedContent = this.detectedInfo.map(info => info.matches.join(', ')).join(', ');
    
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
    this.element = dialog;
    
    // イベントリスナーを設定
    dialog.querySelector('#continue-btn').addEventListener('click', () => {
      this.remove();
      this.onContinue();
    });
    
    dialog.querySelector('#disable-btn').addEventListener('click', async () => {
      await PersonalInfoDetector.disableWarningFor8Hours();
      this.remove();
      this.onDisable();
    });
    
    dialog.querySelector('#cancel-btn').addEventListener('click', () => {
      this.remove();
      this.onCancel();
    });
    
    // ESCキーでキャンセル
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        this.remove();
        this.onCancel();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
    
    return dialog;
  }

  remove() {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    
    // 既存のダイアログもクリーンアップ
    const existingDialog = document.getElementById('personal-info-warning');
    if (existingDialog) {
      existingDialog.remove();
    }
    
    currentDialog = null;
  }
}

// ===== サービス検知 =====
class ServiceDetector {
  static detectCurrentService() {
    const hostname = window.location.hostname;
    debugLog('サービス検知開始', { hostname });
    
    for (const [serviceKey, config] of Object.entries(SERVICE_CONFIGS)) {
      if (config.domains.some(domain => hostname.includes(domain))) {
        debugLog('サービス検知完了', { service: serviceKey, name: config.name });
        return serviceKey;
      }
    }
    
    debugLog('未知のサービス', { hostname });
    return 'unknown';
  }

  static getServiceConfig(serviceKey = null) {
    const service = serviceKey || this.detectCurrentService();
    return SERVICE_CONFIGS[service] || SERVICE_CONFIGS.chatgpt;
  }
}

// ===== DOM要素検出 =====
class ElementDetector {
  static findTextArea(config) {
    debugLog('テキストエリア検索開始', { selectors: config.textAreaSelectors });
    
    // 基本セレクターでの検索
    for (const selector of config.textAreaSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        debugLog(`セレクター "${selector}" で ${elements.length} 個の要素を発見`);
        
        for (const element of elements) {
          // 表示されている要素のみを対象とする
          if (this.isElementVisible(element)) {
            debugLog('テキストエリア検出成功', { 
              selector, 
              tagName: element.tagName,
              contentEditable: element.contentEditable,
              className: element.className
            });
            return element;
          }
        }
      } catch (error) {
        debugLog(`セレクター "${selector}" でエラー`, error.message);
      }
    }
    
    // フォールバック1: すべてのcontenteditable要素を確認
    try {
      const allEditables = document.querySelectorAll('[contenteditable="true"]');
      debugLog('フォールバック検索（contenteditable）', { count: allEditables.length });
      
      for (const element of allEditables) {
        if (this.isElementVisible(element) && this.isElementSizable(element)) {
          debugLog('フォールバックでテキストエリア検出', { 
            className: element.className,
            size: { width: element.offsetWidth, height: element.offsetHeight }
          });
          return element;
        }
      }
    } catch (error) {
      debugLog('フォールバック検索エラー', error.message);
    }
    
    // フォールバック2: すべてのtextarea要素を確認
    try {
      const allTextareas = document.querySelectorAll('textarea');
      debugLog('フォールバック検索（textarea）', { count: allTextareas.length });
      
      for (const element of allTextareas) {
        if (this.isElementVisible(element)) {
          debugLog('フォールバックでtextarea検出', { 
            className: element.className,
            placeholder: element.placeholder
          });
          return element;
        }
      }
    } catch (error) {
      debugLog('textarea検索エラー', error.message);
    }
    
    debugLog('テキストエリアが見つかりません');
    return null;
  }

  static findSendButton(config) {
    debugLog('送信ボタン検索開始', { selectors: config.sendButtonSelectors });
    
    // 基本セレクターでの検索
    for (const selector of config.sendButtonSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        debugLog(`セレクター "${selector}" で ${elements.length} 個のボタンを発見`);
        
        for (const element of elements) {
          if (!element.disabled && this.isElementVisible(element)) {
            const ariaLabel = element.getAttribute('aria-label') || '';
            const textContent = element.textContent?.trim() || '';
            
            // サイドバーボタンを除外
            if (ariaLabel.includes('サイドバー') || 
                ariaLabel.includes('sidebar') || 
                ariaLabel.toLowerCase().includes('sidebar') ||
                textContent.includes('サイドバー') ||
                textContent.toLowerCase().includes('sidebar')) {
              debugLog(`サイドバーボタンをスキップ`, { ariaLabel, textContent });
              continue;
            }
            
            debugLog('送信ボタン検出成功', { 
              selector,
              ariaLabel,
              textContent
            });
            return element;
          }
        }
      } catch (error) {
        debugLog(`セレクター "${selector}" でエラー`, error.message);
      }
    }
    
    // フォールバック1: テキストエリア近くの送信ボタンを探す
    try {
      const textArea = this.findTextArea(config);
      if (textArea) {
        debugLog('テキストエリア近くのボタンを検索中...');
        
        // テキストエリアの親要素を段階的に探す
        let container = textArea.parentElement;
        let attempts = 0;
        
        while (container && attempts < 5) {
          const buttons = container.querySelectorAll('button:not([disabled])');
          debugLog(`レベル${attempts + 1}の親要素で ${buttons.length} 個のボタンを発見`, {
            containerTag: container.tagName,
            containerClass: container.className
          });
          
          for (const button of buttons) {
            const hasIcon = button.querySelector('svg');
            const ariaLabel = button.getAttribute('aria-label') || '';
            const textContent = button.textContent?.trim() || '';
            
            debugLog('ボタン詳細情報', {
              ariaLabel,
              textContent,
              hasIcon: !!hasIcon,
              className: button.className,
              visible: this.isElementVisible(button)
            });
            
            // サイドバーボタンを除外
            if (ariaLabel.includes('サイドバー') || 
                ariaLabel.includes('sidebar') || 
                ariaLabel.toLowerCase().includes('sidebar') ||
                textContent.includes('サイドバー') ||
                textContent.toLowerCase().includes('sidebar')) {
              debugLog(`サイドバーボタンをスキップ`, { ariaLabel, textContent });
              continue;
            }
            
            // 送信ボタンの特徴をチェック
            if (this.isElementVisible(button) && (
              (hasIcon && (ariaLabel.toLowerCase().includes('send') || textContent.toLowerCase().includes('send'))) ||
              ariaLabel.toLowerCase().includes('send') ||
              textContent.toLowerCase().includes('send') ||
              button.type === 'submit'
            )) {
              debugLog('フォールバックで送信ボタン検出', { 
                ariaLabel,
                textContent,
                hasIcon: !!hasIcon,
                level: attempts + 1
              });
              return button;
            }
          }
          
          container = container.parentElement;
          attempts++;
        }
      }
    } catch (error) {
      debugLog('フォールバック検索エラー', error.message);
    }
    
    // フォールバック2: すべてのボタンから送信ボタンを探す
    try {
      const allButtons = document.querySelectorAll('button:not([disabled])');
      debugLog('フォールバック検索（全ボタン）', { count: allButtons.length });
      
      // 送信ボタンの候補を評価
      const candidates = [];
      
      for (const button of allButtons) {
        if (!this.isElementVisible(button)) continue;
        
        const hasIcon = button.querySelector('svg');
        const ariaLabel = button.getAttribute('aria-label') || '';
        const textContent = button.textContent?.trim() || '';
        const className = button.className || '';
        
        let score = 0;
        
        // 除外条件を最初にチェック
        if (ariaLabel.includes('サイドバー') || 
            ariaLabel.includes('sidebar') || 
            ariaLabel.toLowerCase().includes('sidebar') ||
            textContent.includes('サイドバー') ||
            textContent.toLowerCase().includes('sidebar') ||
            textContent.includes('Cancel') || 
            textContent.includes('キャンセル') ||
            ariaLabel.includes('menu') ||
            ariaLabel.includes('メニュー')) {
          continue; // スキップ
        }
        
        // スコアリング
        if (ariaLabel.toLowerCase().includes('send')) score += 10;
        if (textContent.toLowerCase().includes('send')) score += 10;
        if (ariaLabel.includes('送信')) score += 10;
        if (textContent.includes('送信')) score += 10;
        if (button.type === 'submit') score += 8;
        if (className.toLowerCase().includes('send')) score += 5;
        if (ariaLabel.includes('Message')) score += 3;
        if (hasIcon && score > 0) score += 2; // アイコンはボーナス点のみ
        
        if (score > 0) {
          candidates.push({
            button,
            score,
            ariaLabel,
            textContent,
            hasIcon: !!hasIcon
          });
        }
      }
      
      // スコアでソート
      candidates.sort((a, b) => b.score - a.score);
      
      debugLog('送信ボタン候補', candidates.slice(0, 5));
      
      if (candidates.length > 0) {
        debugLog('最高スコアの送信ボタンを選択', candidates[0]);
        return candidates[0].button;
      }
    } catch (error) {
      debugLog('全ボタン検索エラー', error.message);
    }
    
    debugLog('送信ボタンが見つかりません');
    
    // デバッグ: 送信ボタンらしきボタンを表示
    try {
      const allButtons = document.querySelectorAll('button');
      const relevantButtons = Array.from(allButtons)
        .filter(btn => {
          const ariaLabel = btn.getAttribute('aria-label') || '';
          const textContent = btn.textContent?.trim() || '';
          return (ariaLabel.toLowerCase().includes('send') || 
                  textContent.toLowerCase().includes('send') ||
                  ariaLabel.includes('送信') ||
                  textContent.includes('送信') ||
                  btn.type === 'submit') &&
                 !ariaLabel.includes('サイドバー') &&
                 !ariaLabel.includes('sidebar');
        })
        .slice(0, 10);
        
      debugLog('デバッグ: 送信ボタン候補', relevantButtons.map(btn => ({
        ariaLabel: btn.getAttribute('aria-label'),
        textContent: btn.textContent?.trim(),
        disabled: btn.disabled,
        hasIcon: !!btn.querySelector('svg'),
        className: btn.className,
        visible: this.isElementVisible(btn),
        type: btn.type
      })));
    } catch (error) {
      debugLog('デバッグ情報取得エラー', error.message);
    }
    
    return null;
  }
  
  static isElementVisible(element) {
    try {
      if (!element || !element.offsetParent) return false;
      
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && 
             style.visibility !== 'hidden' && 
             style.opacity !== '0';
    } catch (error) {
      return true; // エラーの場合は可視とみなす
    }
  }
  
  static isElementSizable(element) {
    try {
      return element.offsetWidth > 50 && element.offsetHeight > 20;
    } catch (error) {
      return true; // エラーの場合はサイズOKとみなす
    }
  }
}

// ===== 送信監視システム =====
class SubmissionMonitor {
  constructor() {
    this.service = ServiceDetector.detectCurrentService();
    this.config = ServiceDetector.getServiceConfig(this.service);
    this.isInitialized = false;
    this.eventHandlers = new Map();
    this.lastProcessedText = '';
    this.warningDialog = new WarningDialog(null, null, null, null);
  }

  async init() {
    if (this.isInitialized) return;
    
    debugLog(`監視システム初期化開始`, { service: this.service, name: this.config.name });
    
    // Claude専用の強化された監視
    if (this.service === 'claude') {
      this.setupClaudeSpecialHandling();
    }
    
    this.setupEventHandlers();
    this.isInitialized = true;
    
    // ページ変更を監視
    this.observePageChanges();
    
    debugLog('監視システム初期化完了');
  }

  setupClaudeSpecialHandling() {
    debugLog('Claude専用処理を設定中...');
    
    // 1. Enterキーの完全阻止（最優先）
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        const textArea = ElementDetector.findTextArea(this.config);
        if (textArea && (event.target === textArea || textArea.contains(event.target))) {
          debugLog('Claude Enterキー完全阻止', { 
            eventType: event.type,
            target: event.target.tagName,
            isProcessing: isProcessingSubmission
          });
          
          // 即座にイベントを阻止
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          
          // 個人情報検知処理を実行
          this.processSubmission(event);
        }
      }
    }, { capture: true, passive: false });
    
    // 2. keypress イベントも阻止（二重保険）
    document.addEventListener('keypress', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        const textArea = ElementDetector.findTextArea(this.config);
        if (textArea && (event.target === textArea || textArea.contains(event.target))) {
          debugLog('Claude Enterキー keypress阻止');
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
      }
    }, { capture: true, passive: false });
    
    // 3. keyup イベントも阻止（三重保険）
    document.addEventListener('keyup', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        const textArea = ElementDetector.findTextArea(this.config);
        if (textArea && (event.target === textArea || textArea.contains(event.target))) {
          debugLog('Claude Enterキー keyup阻止');
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
      }
    }, { capture: true, passive: false });
    
    // 4. より広範囲なイベントキャプチャ
    const captureEvents = ['click', 'mousedown', 'mouseup'];
    
    captureEvents.forEach(eventType => {
      document.addEventListener(eventType, (event) => {
        this.handleClaudeEvent(event);
      }, { capture: true, passive: false });
    });
    
    // 5. フォーム送信の完全阻止
    document.addEventListener('submit', (event) => {
      debugLog('フォーム送信検知', { target: event.target });
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.processSubmission(event);
    }, { capture: true, passive: false });
    
    // 6. ProseMirrorエディタ特有の処理
    setTimeout(() => {
      const textArea = ElementDetector.findTextArea(this.config);
      if (textArea) {
        // ProseMirrorエディタに直接イベントリスナーを追加
        textArea.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            debugLog('ProseMirror直接Enterキー阻止');
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            this.processSubmission(event);
          }
        }, { capture: true, passive: false });
        
        textArea.addEventListener('keypress', (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            debugLog('ProseMirror直接keypress阻止');
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
          }
        }, { capture: true, passive: false });
      }
    }, 1000);
  }

  handleClaudeEvent(event) {
    try {
      // Enterキーの処理
      if (event.type === 'keydown' && event.key === 'Enter' && !event.shiftKey) {
        const textArea = ElementDetector.findTextArea(this.config);
        if (textArea && (event.target === textArea || textArea.contains(event.target))) {
          debugLog('Claude Enterキー検知', { 
            eventType: event.type,
            target: event.target.tagName,
            isProcessing: isProcessingSubmission
          });
          this.processSubmission(event);
        }
      }
      
      // クリックイベントの処理
      if (event.type === 'click') {
        // 送信ボタンを動的に検索
        const sendButton = ElementDetector.findSendButton(this.config);
        if (sendButton && (event.target === sendButton || sendButton.contains(event.target))) {
          debugLog('Claude 送信ボタンクリック検知', {
            button: sendButton,
            target: event.target,
            isProcessing: isProcessingSubmission
          });
          this.processSubmission(event);
        }
      }
    } catch (error) {
      debugLog('Claude イベント処理エラー', error.message);
    }
  }

  setupEventHandlers() {
    // 全体的なイベントキャプチャ
    document.addEventListener('keydown', this.handleKeydown.bind(this), { capture: true, passive: false });
    document.addEventListener('click', this.handleClick.bind(this), { capture: true, passive: false });
    document.addEventListener('submit', this.handleSubmit.bind(this), { capture: true, passive: false });
  }

  async handleKeydown(event) {
    try {
      if (event.key === 'Enter' && !event.shiftKey) {
        const textArea = ElementDetector.findTextArea(this.config);
        if (textArea && (event.target === textArea || textArea.contains(event.target))) {
          debugLog('Enterキー送信検知', { target: event.target.tagName });
          await this.processSubmission(event);
        }
      }
    } catch (error) {
      debugLog('Enterキー処理エラー', error.message);
    }
  }

  async handleClick(event) {
    try {
      // 送信ボタンを動的に検索
      const sendButton = ElementDetector.findSendButton(this.config);
      if (sendButton && (event.target === sendButton || sendButton.contains(event.target))) {
        debugLog('送信ボタンクリック検知', { button: sendButton });
        await this.processSubmission(event);
      }
    } catch (error) {
      debugLog('クリック処理エラー', error.message);
    }
  }

  async handleSubmit(event) {
    try {
      debugLog('フォーム送信検知', { target: event.target });
      await this.processSubmission(event);
    } catch (error) {
      debugLog('フォーム送信処理エラー', error.message);
    }
  }

  async processSubmission(event) {
    if (isProcessingSubmission) {
      debugLog('既に処理中のため、重複処理をスキップ');
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    debugLog('送信処理開始', { 
      eventType: event.type, 
      key: event.key,
      target: event.target.tagName,
      service: this.service
    });

    isProcessingSubmission = true;

    try {
      const textArea = ElementDetector.findTextArea(this.config);
      if (!textArea) {
        debugLog('テキストエリアが見つからない');
        return;
      }

      const text = textArea.textContent || textArea.value || '';
      
      // 同じテキストを連続で処理しないようにする
      if (text === this.lastProcessedText) {
        debugLog('同じテキストのため処理をスキップ');
        return;
      }

      this.lastProcessedText = text;

      if (!text.trim()) {
        debugLog('空のテキストのため処理をスキップ');
        return;
      }

      // 8時間無効化チェック
      if (await this.isWarningDisabled()) {
        debugLog('警告が無効化されているため処理をスキップ');
        return;
      }

      // 個人情報検知
      const detectedInfo = PersonalInfoDetector.detectPersonalInfo(text);
      
      if (detectedInfo.length > 0) {
        debugLog('個人情報を検知', detectedInfo);
        
        // 必ず送信を阻止
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        // Enterキーの場合、追加の阻止処理
        if (event.key === 'Enter') {
          // 少し遅延させて確実に阻止
          setTimeout(() => {
            const newTextArea = ElementDetector.findTextArea(this.config);
            if (newTextArea) {
              // フォーカスを一時的に外す
              newTextArea.blur();
              setTimeout(() => {
                newTextArea.focus();
              }, 100);
            }
          }, 10);
        }
        
        // 警告ダイアログを表示
        this.warningDialog.show(detectedInfo, () => {
          debugLog('ユーザーが送信を承認');
          this.handleContinueSubmission(event);
        });
        
      } else {
        debugLog('個人情報は検知されませんでした');
        // 個人情報が検知されない場合は送信を許可
        isProcessingSubmission = false;
      }

    } catch (error) {
      debugLog('送信処理中にエラー発生', error);
      isProcessingSubmission = false;
    }
  }

  showWarningDialog(detectedInfo, originalEvent) {
    if (currentDialog) {
      currentDialog.remove();
    }

    const dialog = new WarningDialog(
      detectedInfo,
      () => this.handleContinueSubmission(originalEvent), // 送信継続
      () => this.handleContinueSubmission(originalEvent), // 8時間無効化
      () => this.handleCancelSubmission() // キャンセル
    );

    currentDialog = dialog;
    dialog.create();
  }

  handleContinueSubmission(originalEvent) {
    debugLog('ユーザーが送信を承認');
    
    // 元のイベントを再実行
    setTimeout(() => {
      isProcessingSubmission = false;
      this.lastProcessedText = ''; // リセット
      
      if (originalEvent.type === 'keydown' && originalEvent.key === 'Enter') {
        const textArea = ElementDetector.findTextArea(this.config);
        if (textArea) {
          debugLog('Enterキーでの送信を実行中...');
          
          // 一時的に全ての監視を無効化
          isProcessingSubmission = true;
          
          // Claude専用: ProseMirrorエディタでの送信
          if (this.service === 'claude') {
            // 方法1: 送信ボタンを探してクリック
            const sendButton = ElementDetector.findSendButton(this.config);
            if (sendButton) {
              debugLog('送信ボタンをクリックして送信実行');
              setTimeout(() => {
                isProcessingSubmission = false;
                sendButton.click();
              }, 100);
              return;
            }
            
            // 方法2: フォームを探して送信
            const form = textArea.closest('form');
            if (form) {
              debugLog('フォーム送信を実行');
              setTimeout(() => {
                isProcessingSubmission = false;
                form.submit();
              }, 100);
              return;
            }
            
            // 方法3: Enterキーイベントを再送信（監視を一時停止）
            debugLog('Enterキーイベントを再送信');
            
            // 全てのEnterキーリスナーを一時的に無効化
            const originalHandlers = [];
            
            // 新しいEnterキーイベントを作成
            const newEvent = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
              view: window
            });
            
            setTimeout(() => {
              isProcessingSubmission = false;
              textArea.dispatchEvent(newEvent);
              debugLog('Enterキーイベントを再送信完了');
            }, 200);
          } else {
            // 他のサービス用の処理
            const newEvent = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              bubbles: true,
              cancelable: true
            });
            
            setTimeout(() => {
              isProcessingSubmission = false;
              textArea.dispatchEvent(newEvent);
              debugLog('Enterキーイベントを再送信');
            }, 50);
          }
        }
      } else {
        // クリックイベントの場合
        const sendButton = ElementDetector.findSendButton(this.config);
        if (sendButton) {
          // 一時的に監視を無効化
          isProcessingSubmission = true;
          
          setTimeout(() => {
            isProcessingSubmission = false;
            sendButton.click();
            debugLog('送信ボタンを再クリック');
          }, 50);
        }
      }
    }, 100);
  }

  handleCancelSubmission() {
    debugLog('ユーザーが送信をキャンセル');
    isProcessingSubmission = false;
    this.lastProcessedText = '';
  }

  observePageChanges() {
    const observer = new MutationObserver(() => {
      // ページ構造が変更された場合の再初期化
      // 頻繁な再初期化を防ぐため、条件を厳しくする
      setTimeout(() => {
        const textArea = ElementDetector.findTextArea(this.config);
        if (!textArea && this.isInitialized) {
          debugLog('テキストエリアが消失したため、再初期化をスケジュール');
          this.reinitialize();
        }
      }, 2000); // 2秒後にチェック
    });

    observer.observe(document.body, {
      childList: true,
      subtree: false // サブツリーの監視を無効化してパフォーマンス向上
    });
  }

  reinitialize() {
    if (!this.isInitialized) return; // 既に初期化されていない場合はスキップ
    
    debugLog('ページ構造変更を検知、再初期化中...');
    this.isInitialized = false;
    
    // 重複初期化を防ぐため、少し長めの遅延
    setTimeout(() => {
      if (!this.isInitialized) { // 二重初期化防止
        this.init();
      }
    }, 1000);
  }
}

// ===== バナー表示 =====
class WarningBanner {
  static async create() {
    const service = ServiceDetector.detectCurrentService();
    const config = ServiceDetector.getServiceConfig(service);
    
    try {
      // Chrome拡張機能のストレージが利用可能かチェック
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get(['bannerClosed']);
        if (result.bannerClosed) return;
      }
    } catch (error) {
      debugLog('バナー状態の取得エラー', error.message);
    }

    const existingBanner = document.getElementById('ai-warning-banner');
    if (existingBanner) return;

    const banner = document.createElement('div');
    banner.id = 'ai-warning-banner';
    banner.className = 'ai-warning-banner';
    banner.innerHTML = `
      <div class="banner-content">
        <span class="banner-text">
          ⚠️ <strong>${config.name}</strong>では生成AI利活用ガイドラインに基づき、
          個人情報や機密情報の入力前にCorp-ITと法務チーム、所属上長に相談してください
        </span>
        <button class="banner-close" id="banner-close-btn">×</button>
      </div>
    `;

    document.body.insertBefore(banner, document.body.firstChild);

    document.getElementById('banner-close-btn').addEventListener('click', async () => {
      banner.remove();
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({ bannerClosed: true });
        }
      } catch (error) {
        debugLog('バナー状態の保存エラー', error.message);
      }
    });
  }
}

// ===== 初期化 =====
function initializePersonalInfoDetector() {
  const service = ServiceDetector.detectCurrentService();
  
  if (service === 'unknown') {
    debugLog('未対応のAIサービス', { hostname: window.location.hostname });
    return;
  }

  debugLog('個人情報検知器初期化開始', { service });

  // バナーを表示
  WarningBanner.create();

  // 送信監視を開始
  const monitor = new SubmissionMonitor();
  
  // DOMが読み込まれるまで待機
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => monitor.init(), 1000);
    });
  } else {
    setTimeout(() => monitor.init(), 1000);
  }
  
  // 追加の初期化確認
  setTimeout(() => {
    if (!monitor.isInitialized) {
      debugLog('初期化が完了していないため、再試行');
      monitor.init();
    }
  }, 3000);
}

// ===== デバッグ用テスト関数 =====
window.testPersonalInfoDetector = function() {
  debugLog('=== デバッグテスト開始 ===');
  
  const service = ServiceDetector.detectCurrentService();
  const config = ServiceDetector.getServiceConfig(service);
  
  debugLog('サービス情報', { service, config });
  
  const textArea = ElementDetector.findTextArea(config);
  const sendButton = ElementDetector.findSendButton(config);
  
  debugLog('DOM要素検出結果', { 
    textArea: !!textArea,
    sendButton: !!sendButton,
    textAreaInfo: textArea ? {
      tagName: textArea.tagName,
      contentEditable: textArea.contentEditable,
      className: textArea.className
    } : null,
    sendButtonInfo: sendButton ? {
      tagName: sendButton.tagName,
      ariaLabel: sendButton.getAttribute('aria-label'),
      textContent: sendButton.textContent?.trim()
    } : null
  });
  
  if (textArea) {
    const text = PersonalInfoDetector.extractTextFromElement(textArea);
    const detected = PersonalInfoDetector.detectPersonalInfo(text);
    
    debugLog('テキスト解析結果', {
      textLength: text.length,
      preview: text.substring(0, 100),
      detectedCount: detected.length,
      detected: detected.map(d => d.type)
    });
  }
  
  debugLog('=== デバッグテスト完了 ===');
};

// ===== スタート =====
initializePersonalInfoDetector(); 