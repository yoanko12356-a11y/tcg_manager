import json
import os
import re
import random
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from bs4 import BeautifulSoup

def normalize(text):
    if not text: return ""
    text = text.translate(str.maketrans('０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰQRSTUVWXYZ／', '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/'))
    return text.lower().replace(" ", "").replace(" ", "")

print("🌿 サーバーに優しい安全・爆速モードでカード収集を開始するよ！")

url = "https://dm.takaratomy.co.jp/card/"
headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; TCG-Manager-Bot/1.0)",
    "Content-Type": "application/x-www-form-urlencoded"
}

session = requests.Session()
seen_urls = set()
all_card_links = []

# ==========================================
# フェーズ1: 全467ページのURLを回収
# ==========================================
print("フェーズ1: 全ページのカードURLを優しく回収中...")
page = 1
while True:
    payload = [
        ('suggest', 'on'),
        ('keyword_type[]', 'card_name'),
        ('keyword_type[]', 'card_ruby'),
        ('keyword_type[]', 'card_text'),
        ('culture_cond[]', '単色'),
        ('culture_cond[]', '多色'),
        ('pagenum', str(page)),
        ('samename', 'show'),
        ('sort', 'release_new')
    ]

    try:
        res = session.post(url, data=payload, headers=headers)
        if res.status_code != 200:
            break

        soup = BeautifulSoup(res.text, 'html.parser')
        links = soup.find_all('a', href=lambda h: h and '/card/detail/' in h)

        if not links:
            break

        new_count = 0
        for a in links:
            href = a['href']
            if not href.startswith('http'):
                href = "https://dm.takaratomy.co.jp" + href
            if href not in seen_urls:
                seen_urls.add(href)
                all_card_links.append(href)
                new_count += 1

        if new_count == 0:
            break

        print(f"ページ {page} 完了（累計URL: {len(all_card_links)}件）")
        page += 1
        # 一覧ページの間にも少しだけお行儀よくウェイトを入れる
        time.sleep(0.3)
    except Exception as e:
        print(f"ページ取得エラー (P.{page}): {e}")
        break

print(f"\n✨ URLの回収完了！合計 {len(all_card_links)} 件のカード詳細を安全な並行処理で取得するよ！\n")

# ==========================================
# フェーズ2: サーバーに配慮したマルチスレッド取得
# ==========================================
cards = []

def fetch_card_detail(detail_url):
    try:
        # サーバー負荷軽減のためのゆとり
        time.sleep(random.uniform(0.2, 0.5))
        
        res = requests.get(detail_url, headers=headers, timeout=15)
        if res.status_code != 200:
            return None
            
        detail_soup = BeautifulSoup(res.text, 'html.parser')

        # 1. カード名
        name_tag = detail_soup.select_one('.card-name, h1.title, .card_name, .title')
        name = name_tag.text.strip() if name_tag else ""

        # 2. 型番
        code_tag = detail_soup.select_one('.card-number, .number, .no, .card_no')
        code = code_tag.text.strip() if code_tag else ""

        # 3. 画像URL
        img_tag = detail_soup.select_one('.card-img img, .img img, .card_thumb img')
        img_url = img_tag['src'] if img_tag and img_tag.has_attr('src') else ""
        if img_url and not img_url.startswith('http'):
            img_url = "https://dm.takaratomy.co.jp" + img_url

        if not code and img_url:
            match = re.search(r'/([^/]+)\.(?:jpg|png)', img_url)
            code = match.group(1) if match else ""

        # ==========================================
        # 新しく追加する情報の取得部分
        # ==========================================
        
        # コスト
        cost_tag = detail_soup.select_one('.cost, .card-cost') # 公式のクラス名に合わせて調整してね
        cost = cost_tag.text.strip() if cost_tag else ""

        # パワー
        power_tag = detail_soup.select_one('.power, .card-power')
        power = power_tag.text.strip() if power_tag else ""

        # 文明（複数ある場合もあるのでリストや文字列としてまとめる）
        civ_tags = detail_soup.select('.civ, .card-civ img') # 画像アイコンのaltやクラスから取得する場合も
        civs = [img.get('alt', '') for img in civ_tags if img.get('alt')] if civ_tags else []
        
        # 種族
        race_tag = detail_soup.select_one('.race, .card-race')
        race = race_tag.text.strip() if race_tag else ""

        # テキスト（能力欄）
        text_tag = detail_soup.select_one('.text, .card-text, .ability')
        card_text = text_tag.text.strip() if text_tag else ""

        return {
            "name": name,
            "product_code": code,
            "search_code": normalize(code),
            "image_url": img_url,
            "detail_url": detail_url,
            "cost": cost,
            "power": power,
            "civilizations": civs,
            "race": race,
            "text": card_text
        }
    except Exception:
        return None

# 同時アクセス数は「6」に抑えて、サーバーを攻撃していると誤認されないようにするよ！
max_workers = 6
completed_count = 0

with ThreadPoolExecutor(max_workers=max_workers) as executor:
    future_to_url = {executor.submit(fetch_card_detail, link): link for link in all_card_links}
    
    for future in as_completed(future_to_url):
        result = future.result()
        completed_count += 1
        if result:
            result["id"] = len(cards) + 1
            cards.append(result)
        
        if completed_count % 100 == 0 or completed_count == len(all_card_links):
            print(f"進捗: {completed_count} / {len(all_card_links)} 件完了...")

# ==========================================
# Step 3: 保存処理
# ==========================================
script_dir = os.path.dirname(os.path.abspath(__file__))
json_path = os.path.join(script_dir, 'all_cards.json')

with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(cards, f, ensure_ascii=False, indent=2)

print(f"\n🎉 すべての安全な収集作業が完了したよ！合計 {len(cards)} 件を 'all_cards.json' に保存したよ！")