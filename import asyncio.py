import asyncio
import aiohttp
from bs4 import BeautifulSoup
import re
import urllib.parse

def clean_search_query(card_name):
    """
    カード名から「カードのベース名」と「型番（㊙→秘に変換）」を抽出して、
    カードラッシュの検索に最適な形にする
    """
    match = re.search(r'\(([^)]+)\)', card_name)
    base_name = re.sub(r'\s*\(.*?\)', '', card_name).strip()
    
    if not match:
        return base_name
    
    inner_text = match.group(1).strip()
    inner_text = inner_text.replace("㊙", "秘")
    
    parts = inner_text.split()
    if len(parts) >= 2:
        number_part = " ".join(parts[1:])
        return f"{base_name} {number_part}"
        
    return card_name.replace("㊙", "秘")

async def fetch_card_rush_price(session, search_query):
    """カードラッシュの非同期価格取得（正確な在庫数要素のチェック版）"""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        safe_query = clean_search_query(search_query)
        print(f"🔍 検索クエリ: {safe_query}")
        
        encoded_query = urllib.parse.quote(safe_query)
        search_url = f"https://cardrush-dm.jp/product-list?keyword={encoded_query}&Submit=検索"
        
        async with session.get(search_url, headers=headers, timeout=10) as response:
            if response.status != 200:
                print("❌ 検索ページへのアクセス失敗")
                return "×"
            html = await response.text()
            
        soup = BeautifulSoup(html, 'html.parser')
        detail_url = None
        
        for link in soup.find_all('a', href=True):
            href = link['href']
            if "/product/" in href:
                detail_url = "https://cardrush-dm.jp" + href if not href.startswith("http") else href
                break
                
        if not detail_url:
            print("❌ 商品詳細URLが見つかりませんでした")
            return "×"
            
        print(f"🔗 詳細URL: {detail_url}")
        
        async with session.get(detail_url, headers=headers, timeout=10) as response:
            if response.status != 200:
                print("❌ 詳細ページへのアクセス失敗")
                return "×"
            detail_html = await response.text()
            
        detail_soup = BeautifulSoup(detail_html, 'html.parser')
        
        # ★ カートボタンは使わず、画像のHTML構造（class="detail_section stock" または class="stock"）で完全に在庫数を測る！
        stock_elem = detail_soup.find(class_=lambda x: x and ('stock' in x))
        
        if stock_elem:
            stock_text = stock_elem.get_text(strip=True)
            print(f"📦 検出された在庫テキスト: {stock_text}")
            
            match_stock = re.search(r'\d+', stock_text)
            if match_stock:
                stock_count = int(match_stock.group())
                print(f"🔢 抽出された在庫数: {stock_count}")
                
                # 在庫数が「0」なら価格を見ずに即×を返す
                if stock_count == 0:
                    print("❌ 在庫が0のため「×」を返します")
                    return "×"
            else:
                print("⚠️ 在庫数から数字が見つからなかったため「×」を返します")
                return "×"
        else:
            print("⚠️ 在庫要素自体が見つからないため「×」を返します")
            return "×"

        # 在庫数が1以上と確認できた場合のみ、価格を取得する
        price_elem = detail_soup.select_one("#pricech")
        if price_elem:
            price_text = price_elem.get_text().replace("円", "").replace(",", "").strip()
            price_match = re.search(r'\d+', price_text)
            if price_match:
                price = int(price_match.group())
                print(f"💰 取得価格: {price}円")
                return price
                
        return "×"
    except Exception as e:
        print(f"⚠️ エラー発生: {e}")
        return "×"

async def main():
    test_cards = [
        "流星アーシュ＜私が主役⁉＞(DM26EX3 ㊙2超/㊙20)",
        "邪帝類五龍目 ドミティウス(DM26EX3 14/100)"
    ]
    
    async with aiohttp.ClientSession() as session:
        for card in test_cards:
            print(f"\n--- テスト開始: {card} ---")
            price = await fetch_card_rush_price(session, card)
            print(f"✨ 結果価格: {price}")

if __name__ == "__main__":
    asyncio.run(main())