import asyncio
import aiohttp
import urllib.parse
import re
from bs4 import BeautifulSoup

def clean_search_query(card_name):
    """カード名から「カードのベース名」と「型番」を抽出して整理する"""
    base_name = re.sub(r'\s*\(.*?\)', '', card_name).strip()
    base_name = re.sub(r'\s*/\s*', '/', base_name)
    
    match = re.search(r'\(([^)]+)\)', card_name)
    if not match:
        return base_name
    
    inner_text = match.group(1).strip().replace("㊙", "秘")
    parts = inner_text.split()
    if len(parts) >= 2:
        number_part = " ".join(parts[1:])
        return f"{base_name} {number_part}"
        
    return f"{base_name} {inner_text}"

def format_torecolo_code(card_name):
    """カード名からトレコロ用の型番に変換する"""
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

async def fetch_card_rush_price(session, search_query):
    """カードラッシュの非同期価格・在庫数取得"""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        safe_query = clean_search_query(search_query)
        encoded_query = urllib.parse.quote(safe_query)
        search_url = f"https://cardrush-dm.jp/product-list?keyword={encoded_query}&Submit=検索"
        
        async with session.get(search_url, headers=headers, timeout=10) as response:
            if response.status != 200:
                return "×", 0
            html = await response.text()
            
        soup = BeautifulSoup(html, 'html.parser')
        detail_url = None
        for link in soup.find_all('a', href=True):
            href = link['href']
            if "/product/" in href:
                detail_url = "https://cardrush-dm.jp" + href if not href.startswith("http") else href
                break
                
        if not detail_url:
            return "×", 0
            
        async with session.get(detail_url, headers=headers, timeout=10) as response:
            if response.status != 200:
                return "×", 0
            detail_html = await response.text()
            
        detail_soup = BeautifulSoup(detail_html, 'html.parser')
        
        stock_count = 0
        stock_elem = detail_soup.find(class_=lambda x: x and ('stock' in x))
        if stock_elem:
            stock_text = stock_elem.get_text(strip=True)
            match_stock = re.search(r'\d+', stock_text)
            if match_stock:
                stock_count = int(match_stock.group())
                if stock_count == 0:
                    return "×", 0
            else:
                return "×", 0
        else:
            return "×", 0

        price_elem = detail_soup.select_one("#pricech")
        if price_elem:
            price_text = price_elem.get_text().replace("円", "").replace(",", "").strip()
            price_match = re.search(r'\d+', price_text)
            if price_match:
                return int(price_match.group()), stock_count
                
        return "×", 0
    except Exception:
        return "×", 0

async def fetch_torecolo_price(session, torecolo_code):
    """トレコロの非同期価格・在庫数取得（美品のみ対象）"""
    try:
        if not torecolo_code:
            return "×", 0
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        search_url = f"https://www.torecolo.jp/shop/goods/search.aspx?ct2=10&search=x&keyword={torecolo_code}"
        
        async with session.get(search_url, headers=headers, timeout=10) as response:
            if response.status != 200:
                return "×", 0
            html = await response.text()
            
        soup = BeautifulSoup(html, 'html.parser')
        
        detail_url = None
        for item in soup.find_all('dl', class_='block-thumbnail-t--goods'):
            comment = item.find(class_="block-thumbnail-t--comment")
            if comment and "キズあり" in comment.get_text():
                continue
            
            link = item.find('a', href=True)
            if link and "/shop/g/g" in link['href']:
                href = link['href']
                detail_url = "https://www.torecolo.jp" + href if not href.startswith("http") else href
                break
                
        if not detail_url:
            return "×", 0
            
        async with session.get(detail_url, headers=headers, timeout=10) as response:
            if response.status != 200:
                return "×", 0
            detail_html = await response.text()
            
        detail_soup = BeautifulSoup(detail_html, 'html.parser')
        
        page_text = detail_soup.get_text()
        if "品切れ" in page_text or "SOLD OUT" in page_text or "売り切れ" in page_text:
            return "×", 0
            
        stock_count = 0
        has_stock = False
        
        stock_elem = detail_soup.find(id="spec_stock_msg")
        if stock_elem:
            match_stock = re.search(r'\d+', stock_elem.get_text(strip=True))
            if match_stock:
                stock_count = int(match_stock.group())
                if stock_count > 0:
                    has_stock = True
        
        if has_stock:
            price_elem = detail_soup.find(class_=lambda x: x and 'price' in x) or detail_soup.find(id="price")
            if price_elem:
                price_text = price_elem.get_text().replace("円", "").replace(",", "").strip()
                price_match = re.search(r'\d+', price_text)
                if price_match:
                    return int(price_match.group()), stock_count
                
        return "×", 0
    except Exception:
        return "×", 0

async def main():
    test_cards = [
        "未来の法皇 ミラダンテSF(DM22RP1 TR2/TR10)",
        "ヘブンズ・ゲート(DMX23 34/60)"
    ]
    
    async with aiohttp.ClientSession() as session:
        for card_name in test_cards:
            print(f"\n==============================")
            print(f"🃏 テスト対象: {card_name}")
            
            search_query = clean_search_query(card_name)
            torecolo_code = format_torecolo_code(card_name)
            
            print(f"  - カードラッシュ用クエリ: {search_query}")
            print(f"  - トレコロ用コード: {torecolo_code}")
            
            rush_res, torecolo_res = await asyncio.gather(
                fetch_card_rush_price(session, search_query),
                fetch_torecolo_price(session, torecolo_code)
            )
            
            print(f"【結果】")
            print(f"  - cardrush: {rush_res[0]}円 (在庫: {rush_res[1]}枚)")
            print(f"  - torecolo: {torecolo_res[0]}円 (在庫: {torecolo_res[1]}枚)")

if __name__ == "__main__":
    asyncio.run(main())