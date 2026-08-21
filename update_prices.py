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

def clean_search_query(card_name):
    """
    カード名から括弧内のコード部分を抽出し、
    カードラッシュの検索に適した形式（例: 「㊙」を「秘」に置換、スペース調整）に整える
    """
    match = re.search(r'\(([^)]+)\)', card_name)
    if not match:
        return card_name.strip()
    
    inner_text = match.group(1).strip() # 例: "DM26EX3 ㊙2超/㊙20"
    
    # ★ 「㊙」を「秘」に置き換える！
    inner_text = inner_text.replace("㊙", "秘")
    
    # パックコード（例: DM26EX3）と番号部分（例: 14/100 や 秘2超/秘20）を分ける
    parts = inner_text.split()
    if len(parts) >= 2:
        pack_code = parts[0] # "DM26EX3"
        number_part = parts[1] # "秘2超/秘20"
        
        # カードラッシュはパックコードと番号の間のスペースを詰めたほうがヒットしやすい（例: DM26EX314/100）
        # なので、くっつけた文字列を返すようにするよ！
        return f"{pack_code}{number_part}"
        
    return inner_text.replace(" ", "")

def format_torecolo_code(card_name):
    """
    カード名に含まれる括弧内の型番（例: "〜(DM24BD4 7/15)"）を
    トレコロ用の型番（"DM24BD47-15"）に変換する
    """
    match = re.search(r'\(([^)]+)\)', card_name)
    if not match:
        return ""
    
    raw_code = match.group(1).strip() # 例: "DM24BD4 7/15"
    # スペースを消して、スラッシュをハイフンに、あるいは数字のつながりを調整する
    raw_code = raw_code.replace("㊙", "H").replace("超", "T")
    # "DM24BD4 7/15" -> パック名と番号の間、または数字の間にルールを適用
    # 例: "DM24BD4 7/15" -> "DM24BD4" と "7/15" に分ける
    parts = raw_code.split()
    if len(parts) >= 2:
        prefix = parts[0] # "DM24BD4"
        fraction = parts[1] # "7/15"
        # スラッシュをハイフンにする ("7/15" -> "7-15") もしトレコロがそうなら
        # ユーザーの提示したURLでは "DM24BD47-15" (DM24BD4 + 7 + -15 ?)
        # よく見ると "DM24BD4 7/15" が "DM24BD47-15" になっているので、
        # prefixの数字の直後とfractionを結合している可能性があるよ！
        # 例: "DM24BD4" -> "DM24BD4", fraction "7/15" -> "7-15" を合わせて "DM24BD47-15"
        fraction_fixed = fraction.replace("/", "-")
        return f"{prefix}{fraction_fixed}"
        
    return raw_code.replace(" ", "").replace("/", "-")

async def fetch_card_rush_price(session, search_query):
    """カードラッシュの非同期価格取得（HTML構造対応版）"""
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
        
        # 検索結果から商品の詳細ページURLを探す
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
        
        # ★ 画像のHTML構造に合わせた在庫数チェック！
        # <p class="stock">在庫数 192点</p> などを探すよ
        stock_elem = detail_soup.find("p", class_="stock")
        if stock_elem:
            stock_text = stock_elem.get_text(strip=True)
            match_stock = re.search(r'\d+', stock_text)
            if match_stock:
                stock_count = int(match_stock.group())
                # 在庫が「0」だったら即「×」を返す！
                if stock_count == 0:
                    return "×"
        else:
            # 在庫要素が見つからない場合も安全のため「×」にするか、カートボタンを見る
            cart_btn = detail_soup.select_one(".cart-in")
            if not cart_btn:
                return "×"

        # 在庫が1以上ある場合のみ価格を取得する
        price_elem = detail_soup.select_one("#pricech")
        if price_elem:
            price_text = price_elem.get_text().replace("円", "").replace(",", "").strip()
            price_match = re.search(r'\d+', price_text)
            if price_match:
                return int(price_match.group())
                
        return "×"
    except Exception:
        return "×"

async def fetch_torecolo_price(session, torecolo_code):
    """トレコロの非同期価格取得（在庫ゼロの誤取得防止版）"""
    try:
        if not torecolo_code:
            return "×"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        search_url = f"https://www.torecolo.jp/shop/goods/search.aspx?ct2=10&search=x&keyword={torecolo_code}"
        
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
        
        # 1. まずページ全体に売り切れ系の文字がないか最終確認
        page_text = detail_soup.get_text()
        if "品切れ" in page_text or "SOLD OUT" in page_text or "売り切れ" in page_text:
            return "×"
            
        # 2. 在庫数の要素から「数字」を正確に抜き出す
        stock_elem = detail_soup.find(class_="stock-status--zero") or detail_soup.find(class_="block-products--product-stock") or detail_soup.find(class_=lambda x: x and 'stock' in x)
        
        has_stock = False
        if stock_elem:
            stock_text = stock_elem.get_text(strip=True)
            # テキストから数字を抽出（例: "3点" -> 3）
            match_stock = re.search(r'\d+', stock_text)
            if match_stock:
                stock_count = int(match_stock.group())
                # ★ 在庫数が「1以上」のときだけフラグを立てる！
                if stock_count > 0:
                    has_stock = True

        # 3. 在庫が1以上あると確証できた場合のみ、価格を取得しに行く！
        if has_stock:
            price_elem = detail_soup.find(class_="price") or detail_soup.find(id="price")
            if price_elem:
                price_text = price_elem.get_text().replace("円", "").replace(",", "").strip()
                price_match = re.search(r'\d+', price_text)
                if price_match:
                    return int(price_match.group())
                
        # 在庫がない、または価格が取れなかった場合はすべて「×」
        return "×"
    except Exception:
        return "×"
# ... (上のコードのインポート部分は同じ)

async def process_card(session, card, index, total_count, date_str, results_dict, semaphore, print_lock):
    async with semaphore:
        card_name = card.get("name", "Unknown")
        
        # ★ ここを修正！カード名全体を渡して、パック番号を除いた検索クエリを作るよ
        search_query = clean_search_query(card_name)
        torecolo_code = format_torecolo_code(card_name)
        
        # 取得処理
        rush_task = fetch_card_rush_price(session, search_query)
        torecolo_task = fetch_torecolo_price(session, torecolo_code)
        rush_price, torecolo_price = await asyncio.gather(rush_task, torecolo_task)
        
        # 結果保存
        if card_name not in results_dict:
            results_dict[card_name] = {}
        results_dict[card_name][date_str] = {
            "cardrush": rush_price,
            "torecolo": torecolo_price
        }

        # 処理が終わったタイミングで、100枚ごとの進捗をログに出す
        if (index - 1) % 100 == 0:
            async with print_lock:
                print(f"📊 {index} 枚目処理完了: {card_name} (Search: {search_query} / TorecoloCode: {torecolo_code})")

async def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    
    if not os.path.exists(ALL_CARDS_PATH):
        print(f"Error: {ALL_CARDS_PATH} が見つからないよ！")
        return

    with open(ALL_CARDS_PATH, "r", encoding="utf-8") as f:
        all_cards = json.load(f)

    all_cards = all_cards[:40]

    total_cards = len(all_cards)
    print(f"=== 全 {total_cards} 枚の価格取得を開始するよ（100枚ごとにログ出力） ===")

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

    semaphore = asyncio.Semaphore(5)
    # ここで print_lock を定義するのを忘れてたよ！
    print_lock = asyncio.Lock()

    async with aiohttp.ClientSession() as session:
        tasks = [
            # ここで print_lock を追加して渡すよ！
            process_card(session, card, i + 1, total_cards, date_str, data, semaphore, print_lock)
            for i, card in enumerate(all_cards)
        ]
        await asyncio.gather(*tasks)

    with open(json_filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
        
    print(f"\n🎉 すべての処理が完了したよ！保存先: {json_filename}")

if __name__ == "__main__":
    asyncio.run(main())