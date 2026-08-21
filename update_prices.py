import json
import os
from datetime import datetime

# 1. 今日の日付から「年月」を自動取得する（例: "2026_08"）
now = datetime.now()
year_month_str = now.strftime("%Y_%m")
today_str = now.strftime("%Y-%m-%d")

filename = f"prices_{year_month_str}.json"
script_dir = os.path.dirname(os.path.abspath(__file__))
json_path = os.path.join(script_dir, filename)

# 2. すでに今月のファイルが存在するか確認し、なければ新しく作る
if os.path.exists(json_path):
    with open(json_path, 'r', encoding='utf-8') as f:
        monthly_data = json.load(f)
else:
    monthly_data = {
        "year": now.year,
        "month": now.month,
        "cards": {}
    }

# 3. 価格データを更新・追加するサンプル処理
# （※実際はここでショップの価格スクレイピング結果などをここに入れるよ！）
sample_updates = {
    "card_001": {"buy": 1500, "sell": 2200},
    "card_002": {"buy": 800, "sell": 1200}
}

for card_id, prices in sample_updates.items():
    if card_id not in monthly_data["cards"]:
        monthly_data["cards"][card_id] = {
            "history": []
        }
    
    # 履歴の配列に今日のデータを追加
    monthly_data["cards"][card_id]["history"].append({
        "date": today_str,
        "buy": prices["buy"],
        "sell": prices["sell"]
    })

# 4. 今月のJSONファイルに上書き保存
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(monthly_data, f, ensure_ascii=False, indent=2)

print(f"✨ 成功！ {filename} を更新したよ！")