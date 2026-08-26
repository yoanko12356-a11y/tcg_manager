import os
import json
import time
import signal
from datetime import datetime
from zoneinfo import ZoneInfo
import re
import urllib.parse
import asyncio
import random
import aiohttp
from bs4 import BeautifulSoup

DATA_DIR = "data"
ALL_CARDS_PATH = "all_cards.json"

def clean_search_query(card_name):
    """
    カード名から特殊な括弧や記号（＜＞、！？など）を取り除いて安全な検索クエリにするよ！
    括弧内の型番（例: DM26SD1 1/13 など）からプレフィックス（DM等）を除去して数字部分を残す調整を行う。
    """
    base_name = re.sub(r'\s*\(.*?\)', '', card_name).strip()
    base_name = re.sub(r'[＜＞「」『』！？!?]', ' ', base_name)
    base_name = re.sub(r'\s*/\s*', '/', base_name)
    base_name = re.sub(r'\s+', ' ', base_name).strip()
    
    match = re.search(r'\(([^)]+)\)', card_name)
    if not match:
        return base_name
    
    inner_text = match.group(1).strip().replace("㊙", "秘")
    parts = inner_text.split()
    if len(parts) >= 2:
        # 例: DM26SD1 のようなプレフィックスから "DM" などを除外して数字+アルファベット部分（26SD1など）にする
        prefix = re.sub(r'^[A-Za-z]+', '', parts[0])
        number_part = " ".join(parts[1:])
        if prefix:
            return f"{base_name} {prefix} {number_part}"
        return f"{base_name} {number_part}"
        
    return f"{base_name} {inner_text}"

def format_torecolo_code(card_name):
    """
    カード名に含まれる括弧内の型番をトレコロ用に変換する
    """
    match = re.search(r'\(([^)]+)\)', card_name)
    if not match:
        return ""
    
    raw_code = match.group(1).strip().replace("㊙", "H").replace("超", "T")
    parts = raw_code.split()
    if len(parts) >= 2:
        prefix = parts[0]
        fraction = parts[1]
        fraction_fixed = fraction.replace("/", "-")
        return f"{prefix}{fraction_fixed}"
        
    return raw_code.replace(" ", "").replace("/", "-")

async def fetch_card_rush_price(session, search_query):
    """
    切断エラーや403対策（自動リトライ＋短縮ウェイト）を組み込んだカードラッシュ価格取得
    """
    safe_query = clean_search_query(search_query)
    encoded_query = urllib.parse.quote(safe_query)
    search_url = f"https://cardrush-dm.jp/product-list?keyword={encoded_query}&Submit=検索"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    max_retries = 2
    for attempt in range(max_retries):
        try:
            await asyncio.sleep(random.uniform(0.1, 0.3))
            
            async with session.get(search_url, headers=headers, timeout=8) as response:
                if response.status == 403:
                    await asyncio.sleep(1.5 * (attempt + 1))
                    continue
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
                
            async with session.get(detail_url, headers=headers, timeout=8) as response:
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
            
        except (asyncio.TimeoutError, aiohttp.ClientConnectorError, aiohttp.ServerDisconnectedError):
            if attempt < max_retries - 1:
                await asyncio.sleep(1 * (attempt + 1))
                continue
            return "×", 0
        except Exception as e:
            return "×", 0
            
    return "×", 0


async def fetch_torecolo_price(session, torecolo_code):
    """トレコロの非同期価格・在庫数取得（403/503リトライ・指数バックオフ対応）"""
    if not torecolo_code:
        return "×", 0
        
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    search_url = f"https://www.torecolo.jp/shop/goods/search.aspx?ct2=10&search=x&keyword={torecolo_code}"
    
    max_retries = 2
    for attempt in range(max_retries):
        try:
            await asyncio.sleep(random.uniform(0.1, 0.3))
            
            async with session.get(search_url, headers=headers, timeout=10) as response:
                if response.status in (403, 429, 503):
                    await asyncio.sleep(1.5 * (attempt + 1))
                    continue
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
            
        except (asyncio.TimeoutError, aiohttp.ClientConnectorError, aiohttp.ServerDisconnectedError):
            if attempt < max_retries - 1:
                await asyncio.sleep(1 * (attempt + 1))
                continue
            return "×", 0
        except Exception as e:
            return "×", 0
            
    return "×", 0

async def process_card(session, card, index, total_count, date_str, results_dict, semaphore, print_lock):
    async with semaphore:
        card_name = card.get("name", "Unknown")
        
        search_query = clean_search_query(card_name)
        torecolo_code = format_torecolo_code(card_name)
        
        rush_task = fetch_card_rush_price(session, search_query)
        torecolo_task = fetch_torecolo_price(session, torecolo_code)
        rush_price, torecolo_price = await asyncio.gather(rush_task, torecolo_task)
        
        if card_name not in results_dict:
            results_dict[card_name] = {}
        results_dict[card_name][date_str] = {
            "cardrush": rush_price,
            "torecolo": torecolo_price
        }

def save_json_atomically(filepath, data):
    """一時ファイル経由で安全にJSONを書き込む（アトミック書き込み）"""
    dir_name = os.path.dirname(filepath)
    os.makedirs(dir_name, exist_ok=True)
    tmp_filepath = f"{filepath}.tmp"
    with open(tmp_filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    os.replace(tmp_filepath, filepath)

async def main():
    start_time = time.time()
    max_runtime_min = int(os.environ.get("MAX_RUNTIME_MINUTES", 200))
    limit_sec = (max_runtime_min * 60) - (10 * 60)

    os.makedirs(DATA_DIR, exist_ok=True)
    
    if not os.path.exists(ALL_CARDS_PATH):
        print(f"Error: {ALL_CARDS_PATH} が見つからないよ！")
        return

    with open(ALL_CARDS_PATH, "r", encoding="utf-8") as f:
        all_cards = json.load(f)

    # 日本時間（JST）を基準に価格取得日を決定
    now = datetime.now(ZoneInfo("Asia/Tokyo"))
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

    cards_to_update = []
    for card in all_cards:
        name = card.get("name")
        if name in data and date_str in data[name]:
            continue
        cards_to_update.append(card)

    total_to_update = len(cards_to_update)
    print(f"=== 全 {len(all_cards)} 枚中、残り {total_to_update} 枚の価格取得を開始するよ ===")

    if total_to_update == 0:
        print("今日の更新はすべて完了しているよ！")
        return

    semaphore = asyncio.Semaphore(8)
    print_lock = asyncio.Lock()

    async with aiohttp.ClientSession() as session:
        batch_size = 20
        for i in range(0, total_to_update, batch_size):
            elapsed = time.time() - start_time
            if elapsed > limit_sec:
                print(f"\n警告: タイムリミットが近づいたため（経過: {int(elapsed/60)}分）、途中で終了して保存します。")
                break

            batch = cards_to_update[i:i+batch_size]
            tasks = [
                process_card(session, card, i + j + 1, total_to_update, date_str, data, semaphore, print_lock)
                for j, card in enumerate(batch)
            ]
            
            await asyncio.gather(*tasks)

            # アトミック書き込みで安全に保存
            save_json_atomically(json_filename, data)
            
            print(f"進捗: {min(i + batch_size, total_to_update)} / {total_to_update} 枚完了 (アトミック保存済み)")

    print(f"\n🎉 処理を終了したよ！現在の保存先: {json_filename}")

if __name__ == "__main__":
    asyncio.run(main())
