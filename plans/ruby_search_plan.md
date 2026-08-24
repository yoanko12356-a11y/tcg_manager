# メイン検索およびサブ検索におけるルビ検索対応プラン

## 概要
ユーザーが検索欄（メイン検索欄およびサブ検索欄）に文字を入力した際、カードのルビ（`ruby` / `card_ruby` など）フィールドも検索対象に含めるように仕様を変更します。

## 変更対象ファイル
- [`app.js`](app.js:1)

## 具体的な変更内容

### 1. データ正規化時の `_rubyNorm` 追加
[`app.js`](app.js:12) の `loadCards` 内で各カードオブジェクトをマップする際、ルビフィールドの正規化プロパティ `_rubyNorm` を追加します。
```javascript
_rubyNorm: normalizeQuery(card.ruby || card.card_ruby || "")
```

### 2. メイン検索の条件追加
[`renderSearchResults`](app.js:142) 内のメイン検索の `matchesMain` 条件に `_rubyNorm.includes(kw)` を追加します。
```javascript
const matchesMain = normalizedKeywords.length === 0 || normalizedKeywords.every(kw => {
  return nameNorm.includes(kw) || 
         codeNorm.includes(kw) || 
         raceNorm.includes(kw) ||
         textNorm.includes(kw) ||
         rubyNorm.includes(kw);
});
```

### 3. サブ検索（フリーワード検索など）の条件追加
ヘッダーおよびスライドメニュー内のサブ検索（特に `free` やテキスト関連）の判定時にも `rubyNorm.includes(kw)` を含めるようにします。

## Mermaidによるワークフロー図

```mermaid
graph TD
    A[ユーザーが検索キーワードを入力] --> B[キーワードを正規化 (normalizedKeywords)]
    B --> C[各カードのデータと比較]
    C --> D[カード名 (_nameNorm)]
    C --> E[型番 (_codeNorm)]
    C --> F[種族 (_raceNorm)]
    C --> G[テキスト (_textNorm)]
    C --> H[ルビ (_rubyNorm) 新規追加]
    D --> I{いずれかに一致?}
    E --> I
    F --> I
    G --> I
    H --> I
    I -->|Yes| J[検索結果に含める]
    I -->|No| K[除外する]
```
