import os
import json
from datetime import datetime
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
        number_part = " ".join(parts[1:])
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
            # スピードを維持しつつサーバーに優しくするための短いランダムウェイト
            await asyncio.sleep(random.uniform(0.1, 0.3))
            
            async with session.get(search_url, headers=headers, timeout=8) as response:
                if response.status == 403:
                    await asyncio.sleep(1.5)
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
                await asyncio.sleep(1)
                continue
            return "×", 0
        except Exception:
            return "×", 0
            
    return "×", 0


async def fetch_torecolo_price(session, torecolo_code):
    """トレコロの非同期価格・在庫数取得"""
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
        
    except asyncio.TimeoutError:
        return "×", 0
    except Exception:
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


async def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    
    if not os.path.exists(ALL_CARDS_PATH):
        print(f"Error: {ALL_CARDS_PATH} が見つからないよ！")
        return

    with open(ALL_CARDS_PATH, "r", encoding="utf-8") as f:
        all_cards = json.load(f)

    total_cards = len(all_cards)
    print(f"=== 全 {total_cards} 枚の価格取得を開始するよ（スピード＆耐性重視版） ===")

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

    # 同時アクセス数を少し多め（8）にしてスピードを維持するよ
    semaphore = asyncio.Semaphore(8)
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