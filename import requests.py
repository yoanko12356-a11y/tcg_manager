import requests
from bs4 import BeautifulSoup
import urllib.parse

# テストしたいカード（型番ベース）
test_data = [
    {"name": "ボルメテウス・モモキング", "code": "DM24BD36-15"},
    {"name": "従獄の死神シンベロス", "code": "DM24BD414-15"} # シンベロスも型番で試すよ
]

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

for item in test_data:
    code = item['code']
    # トレコロの検索URL（型番をキーワードに指定）
    search_url = f"https://www.torecolo.jp/shop/goods/search.aspx?ct2=10&search=x&keyword={code}"
    
    print(f"\n--- トレコロ検索テスト: {item['name']} ({code}) ---")
    
    response = requests.get(search_url, headers=headers)
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # 検索結果から商品リンクを探す（型番で検索すれば1件に絞れるはず！）
    found_item = False
    for link in soup.find_all('a', href=True):
        # トレコロの商品ページURL構造（/shop/g/g[コード]/ とか）を想定
        if "/shop/g/g" in link['href']:
            detail_url = "https://www.torecolo.jp" + link['href']
            print(f"  -> ✅ 商品ページ発見: {detail_url}")
            
            # 詳細ページから価格を取得
            detail_response = requests.get(detail_url, headers=headers)
            detail_soup = BeautifulSoup(detail_response.text, 'html.parser')
            
            # 価格情報を探す（トレコロの価格表示クラスを想定）
            price_elem = detail_soup.find(class_="price") or detail_soup.find(id="price")
            if price_elem:
                print(f"  -> 💰 価格: {price_elem.get_text(strip=True)}")
            else:
                print("  -> ⚠️ 価格要素が見つかりませんでした")
            
            found_item = True
            break
            
    if not found_item:
        print("  -> ❌ 商品が見つかりませんでした")