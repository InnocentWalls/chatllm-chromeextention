# AI個人情報検知器

ChatGPT、Claude、Geminiでプロンプト入力時に個人情報や機密情報を検知し、警告を表示するChrome拡張機能です。

## 機能

- **リアルタイム監視**: 各AIサービスのプロンプト入力をリアルタイムで監視
- **個人情報検知**: 以下のような個人情報パターンを自動検知
  - メールアドレス（@example.com除く）
  - 電話番号（0X-XXXX-XXXX形式）
  - クレジットカード番号（各ブランド対応）
  - パスポート番号（大文字2文字 + 数字7桁）
  - マイナンバー（12桁完全一致）
  - AWSアクセスキー（AKIA...形式）
- **警告ダイアログ**: 検知時に確認ダイアログを表示
- **一時的な無効化**: 8時間警告を停止する機能

## インストール方法

### 開発者モードでのインストール

1. Chromeブラウザで `chrome://extensions/` を開く
2. 右上の「開発者モード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このプロジェクトのフォルダを選択

### アイコンファイルの準備

アイコンファイルが必要です。以下のサイズでPNGファイルを作成してください：
- `icons/icon16.png` (16x16px)
- `icons/icon48.png` (48x48px)
- `icons/icon128.png` (128x128px)

## 使用方法

1. 対象サイトにアクセス：
   - ChatGPT: https://chat.openai.com または https://chatgpt.com
   - Claude: https://claude.ai
   - Gemini: https://gemini.google.com
2. プロンプトを入力して送信ボタンを押す
3. 個人情報が検知された場合、警告ダイアログが表示される
4. ダイアログで以下の選択が可能：
   - **はい、送信します**: プロンプトを送信
   - **8時間表示を止める**: 8時間警告を無効にして送信
   - **キャンセル**: 送信をキャンセル

## 拡張機能のポップアップ

ブラウザツールバーのアイコンをクリックすると：
- 監視状態の確認
- 警告機能の有効/無効の切り替え
- 検知パターンの確認

## 検知パターン

現在実装されている検知パターン：

```javascript
{
  email: /[a-zA-Z0-9._%+-]+@(?!example\.com\b)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phoneNumber: /0\d{1,4}-\d{2,4}-\d{2,4}/g,
  creditCard: /(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})/g,
  passportNumber: /[A-Z]{2}\d{7}/g,
  mynumber: /(?<!\d)\d{12}(?!\d)/g,
  awsAccessKey: /AKIA[0-9A-Z]{16}/g
}
```

## カスタマイズ

### 検知パターンの追加

`content.js`の`personalInfoPatterns`オブジェクトに新しいパターンを追加できます：

```javascript
const personalInfoPatterns = {
  // 既存のパターン...
  customPattern: /your-regex-here/g
};
```

### 対象サイトの追加

`manifest.json`の`content_scripts.matches`配列に新しいURLパターンを追加：

```json
{
  "matches": [
    "https://chat.openai.com/*",
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://your-target-site.com/*"
  ]
}
```

## ファイル構成

```
├── manifest.json      # 拡張機能の設定
├── content.js         # メインのコンテンツスクリプト
├── background.js      # バックグラウンドサービスワーカー
├── popup.html         # ポップアップUI
├── popup.js           # ポップアップのJavaScript
├── styles.css         # ダイアログのスタイル
├── icons/             # アイコンファイル（要作成）
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md          # このファイル
```

## 注意事項

- この拡張機能は完璧ではありません。検知されない個人情報もある可能性があります
- 重要な情報を入力する際は、十分注意してください
- 検知パターンは継続的に改善される予定です

## ライセンス

MIT License

## 貢献

プルリクエストやイシューの報告を歓迎します。 