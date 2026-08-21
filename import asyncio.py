import asyncio
import aiohttp
from bs4 import BeautifulSoup
import re

async def format_torecolo_code(card_name):
    """
    カード名に含まれる括弧内の型番をトレコロ用の型番に変換する
    """
    match = re.search(r'\(([^)]+)\)', card_name)
    if not match:
        return ""
    
    raw_code = match.group(1).strip()
    raw_code = raw_code.replace("㊙", "H").replace("超", "T")
    
    parts = raw_code.split()
    if len(parts) >= 2:
        prefix = parts[0]
        fraction = parts[1]
        fraction_fixed = fraction.replace("/", "-")
        return f"{prefix}{fraction_fixed}"
        
    return raw_code.replace(" ", "").replace("/", "-")

async def fetch_torecolo_price(session, torecolo_code):
    """トレコロの非同期価格・在庫数取得（詳細ページの正しい構造に対応）"""
    try:
        if not torecolo_code:
            print("❌ トレコロコードが空です")
            return "×", 0
            
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        search_url = f"https://www.torecolo.jp/shop/goods/search.aspx?ct2=10&search=x&keyword={torecolo_code}"
        print(f"🔍 検索URL: {search_url}")
        
        async with session.get(search_url, headers=headers, timeout=10) as response:
            if response.status != 200:
                print("❌ 検索ページへのアクセス失敗")
                return "×", 0
            html = await response.text()
            
        soup = BeautifulSoup(html, 'html.parser')
        detail_url = None
        for link in soup.find_all('a', href=True):
            href = link['href']
            if "/shop/g/g" in href:
                detail_url = "https://www.torecolo.jp" + href if not href.startswith("http") else href
                break
                
        if not detail_url:
            print("❌ 商品詳細URLが見つかりませんでした")
            return "×", 0
            
        print(f"🔗 詳細URL: {detail_url}")
        
        async with session.get(detail_url, headers=headers, timeout=10) as response:
            if response.status != 200:
                print("❌ 詳細ページへのアクセス失敗")
                return "×", 0
            detail_html = await response.text()
            
        detail_soup = BeautifulSoup(detail_html, 'html.parser')
        
        # 1. 売り切れ系の文字チェック
        page_text = detail_soup.get_text()
        if "品切れ" in page_text or "SOLD OUT" in page_text or "売り切れ" in page_text:
            print("❌ ページ内に売り切れの文字を検出")
            return "×", 0
            
        # 2. ★ 最新のHTML構造（id="spec_stock_msg"）から正確に在庫数を取得する！
        stock_count = 0
        has_stock = False
        
        stock_elem = detail_soup.find(id="spec_stock_msg") or detail_soup.find(class_="block-goods-stock")
        if stock_elem:
            stock_text = stock_elem.get_text(strip=True)
            print(f"📦 検出された在庫テキスト: {stock_text}")
            
            match_stock = re.search(r'\d+', stock_text)
            if match_stock:
                stock_count = int(match_stock.group())
                print(f"🔢 抽出された在庫数: {stock_count}")
                if stock_count > 0:
                    has_stock = True
        else:
            print("⚠️ 在庫要素が見つかりませんでした")

        # 3. 在庫が1以上の場合のみ価格を取得
        if has_stock:
            # トレコロの価格要素（クラス名やIDのパターンに対応）
            price_elem = detail_soup.find(class_=lambda x: x and 'price' in x) or detail_soup.find(id="price")
            if price_elem:
                price_text = price_elem.get_text().replace("円", "").replace(",", "").strip()
                price_match = re.search(r'\d+', price_text)
                if price_match:
                    price = int(price_match.group())
                    print(f"💰 取得価格: {price}円 (在庫: {stock_count}点)")
                    return price, stock_count
                
        print("❌ 在庫がないか価格が見つかりませんでした")
        return "×", 0
    except Exception as e:
        print(f"⚠️ エラー発生: {e}")
        return "×", 0

async def main():
    test_cards = [
        "メガ・マグマ・ドラゴン(DM26EX3 DCR8/DCR15)",
        "シュバルスリング-B3 / エン・ゲルス・スパーク(DM23RP4 46/74)",
        "“末法”チュリス(DMEX02 59/84)",
    ]
    
    async with aiohttp.ClientSession() as session:
        for card in test_cards:
            print(f"\n--- テスト開始: {card} ---")
            torecolo_code = await format_torecolo_code(card)
            print(f"✨ 変換されたトレコロコード: {torecolo_code}")
            price, stock = await fetch_torecolo_price(session, torecolo_code)
            print(f"✨ 結果 -> 価格: {price}, 在庫数: {stock}")

if __name__ == "__main__":
    asyncio.run(main())