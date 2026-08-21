import os
import json
from datetime import datetime
import re
import urllib.parse
import asyncio
import aiohttp
from bs4 import BeautifulSoup

DATA_DIR = "data"
ALL_CARDS_PATH = "all_cards.json"

def clean_search_query(query):
    cleaned = re.sub(r'\s*/\s*', '/', query)
    return cleaned

async def fetch_card_rush_price(session, search_query):
    """カードラッシュの非同期価格取得"""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        safe_query = clean_search_query(search_query)
        encoded_query = urllib.parse.quote(safe_query)
        search_url = f"https://cardrush-dm.jp/product-list?keyword={encoded_query}&Submit=検索"
        
        async with session.get(search_url, headers=headers, timeout=10) as response:
            if response.status != 200:
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
            return "×"
            
        async with session.get(detail_url, headers=headers, timeout=10) as response:
            if response.status != 200:
                return "×"
            detail_html = await response.text()
            
        detail_soup = BeautifulSoup(detail_html, 'html.parser')
        price_elem = detail_soup.select_one("#pricech")
        if price_elem:
            price_text = price_elem.get_text().replace("円", "").replace(",", "").strip()
            return int(price_text)
            
        return "×"
    except Exception:
        return "×"

async def fetch_torecolo_price(session, search_code):
    """トレコロの非同期価格取得（search_codeを使用）"""
    try:
        if not search_code:
            return "×"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        search_url = f"https://www.torecolo.jp/shop/goods/search.aspx?ct2=10&search=x&keyword={search_code}"
        
        async with session.get(search_url, headers=headers, timeout=10) as response:
            if response.status != 200:
                return "×"
            html = await response.text()
            
        soup = BeautifulSoup(html, 'html.parser')
        detail_url = None
        for link in soup.find_all('a', href=True):
            href = link['href']
            if "/shop/g/g" in href:
                detail_url = "https://www.torecolo.jp" + href if not href.startswith("http") else href
                break
                
        if not detail_url:
            return "×"
            
        async with session.get(detail_url, headers=headers, timeout=10) as response:
            if response.status != 200:
                return "×"
            detail_html = await response.text()
            
        detail_soup = BeautifulSoup(detail_html, 'html.parser')
        price_elem = detail_soup.find(class_="price") or detail_soup.find(id="price")
        if price_elem:
            price_text = price_elem.get_text().replace("円", "").replace(",", "").strip()
            price_match = re.search(r'\d+', price_text)
            if price_match:
                return int(price_match.group())
                
        return "×"
    except Exception:
        return "×"

async def process_card(session, card, index, total_count, date_str, results_dict, semaphore, print_lock):
    """進捗カウンター付きのカード処理タスク"""
    async with semaphore:
        card_name = card.get("name", "Unknown")
        search_query = card_name.split("(")[0].strip()
        search_code = card.get("search_code", "")
        
        # 処理開始のログ（ロックをかけて文字が混ざらないようにするよ）
        async with print_lock:
            print(f"[{index}/{total_count}] 🔍 検索中: {card_name}")
        
        # カードラッシュとトレコロを並行取得
        rush_task = fetch_card_rush_price(session, search_query)
        torecolo_task = fetch_torecolo_price(session, search_code)
        
        rush_price, torecolo_price = await asyncio.gather(rush_task, torecolo_task)
        
        # 結果格納
        if card_name not in results_dict:
            results_dict[card_name] = {}
            
        results_dict[card_name][date_str] = {
            "cardrush": rush_price,
            "torecolo": torecolo_price
        }
        
        # 完了ログ
        async with print_lock:
            print(f"[{index}/{total_count}] ✅ 完了: {card_name} (Rush: {rush_price}, Torecolo: {torecolo_price})")

async def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    
    if not os.path.exists(ALL_CARDS_PATH):
        print(f"Error: {ALL_CARDS_PATH} が見つからないよ！")
        return

    with open(ALL_CARDS_PATH, "r", encoding="utf-8") as f:
        all_cards = json.load(f)

    total_cards = len(all_cards)
    print(f"=== 全 {total_cards} 枚の価格取得を開始するよ！ ===")

    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    year_month_str = now.strftime("%Y_%m")
    
    json_filename = os.path.join(DATA_DIR, f"prices_{year_month_str}.json")
    
    if os.path.exists(json_filename):
        with open(json_filename, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                data = {}
    else:
        data = {}

    # 同時接続数（多すぎるとエラーになるので5〜10件程度がおすすめ）
    semaphore = asyncio.Semaphore(5)
    print_lock = asyncio.Lock()

    async with aiohttp.ClientSession() as session:
        tasks = [
            process_card(session, card, i + 1, total_cards, date_str, data, semaphore, print_lock)
            for i, card in enumerate(all_cards)
        ]
        await asyncio.gather(*tasks)

    with open(json_filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
        
    print(f"\n🎉 すべての処理が完了したよ！保存先: {json_filename}")

if __name__ == "__main__":
    asyncio.run(main())