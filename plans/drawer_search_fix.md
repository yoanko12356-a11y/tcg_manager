# コレクションモード詳細検索ドロワーの不具合修正計画

## 1. 不具合の原因
コレクションモードのドロワー（コレクション詳細モーダル/ドロワー）内で、詳細オプション（歯車アイコンで開くポップアップ）の中にあるサブ検索条件の追加ボタン (`drawer-add-sub-search-btn`) や、動的に追加されるサブ検索行 (`drawer-dynamic-sub-search-container` 内の `slide-sub-input` / `slide-sub-type` / `remove-sub-search-btn`) に対するイベントリスナーや動的追加処理が `app.js` に実装されていなかった。そのため、ユーザーがテキストボックスに入力したり、プラスボタン等をクリックした際に意図しないフォーム送信やページ遷移、あるいは検索モードへの誤った遷移（または検索機能の未動作）を引き起こしていた。

また、`renderDrawerSearchResults()` 内で動的サブ検索条件が考慮されていなかったため、検索ロジック自体も通常の検索画面と不整合が生じていた。

## 2. 修正方針
1. **HTML構造の確認**: `index.html` のドロワー内詳細オプションセクションに、検索画面と同様の動的サブ検索用コンテナ (`drawer-dynamic-sub-search-container`) と追加ボタン (`drawer-add-sub-search-btn`) が存在することを確認（既存）。
2. **イベントリスナーの実装 (`app.js`)**:
   - 検索画面と同様に、ドロワー用の「＋」ボタン (`drawer-add-sub-search-btn`) にクリックイベントを設定し、新しいサブ検索行を動的に追加できるようにする。
   - 各サブ検索行の入力 (`input`, `change`) や削除ボタン (`remove-sub-search-btn`) に対して `renderDrawerSearchResults()` を呼び出すイベントリスナーを登録する（共通関数を活用するか、ドロワー専用のバインド処理を追加する）。
3. **検索ロジックの統合 (`renderDrawerSearchResults`)**:
   - 通常の検索 (`renderSearchResults`) と同様に、動的サブ検索行の条件（フリー、テキスト、種族など）も `filtered` の判定に含めるようにする。
