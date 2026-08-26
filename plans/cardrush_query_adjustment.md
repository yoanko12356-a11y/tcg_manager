# カードラッシュ検索クエリ調整プラン

[`update_prices.py`](update_prices.py) 内の `clean_search_query` 関数において、カードラッシュ（`cardrush-dm.jp`）でのヒット率を高めるための検索クエリ生成ロジックを調整します。

## 1. 改善の方向性
現在、カードラッシュ用のクエリは以下のように生成されています：
- 入力: `龍風混成 ザーディクリカ(DM26SD1 1/13)`
- 現状のクエリ: `龍風混成 ザーディクリカ DM26SD1 1/13`

カードラッシュの検索仕様やヒットしやすい形式に合わせて、プレフィックスや型番部分のスペース調整・不要な文字の除去を行います。
（例: `DM` などのプレフィックスや特定コードのフォーマット調整）

## 2. 変更対象コード (`update_prices.py`)
```python
def clean_search_query(card_name):
    """
    カードラッシュ用の検索クエリを最適化するよ！
    """
    base_name = re.sub(r'\s*\(.*?\)', '', card_name).strip()
    base_name = re.sub(r'[＜＞「」『』！？!?]', ' ', base_name)
    base_name = re.sub(r'\s*/\s*', '/', base_name)
    base_name = re.sub(r'\s+', ' ', base_name).strip()
    
    match = re.search(r'\(([^)]+)\)', card_name)
    if not match:
        return base_name
    
    inner_text = match.group(1).strip().replace("㊙", "秘")
    
    # プレフィックス（例: DM26SD1 -> 26SD1 など）の調整や、
    # カードラッシュでよりヒットしやすい形式への置換処理をここに加える
    
    return f"{base_name} {inner_text}"
```

## 3. 次のアクション
この方針に沿って実装・コード修正を行うため、Code モードへの切り替えを提案します。
