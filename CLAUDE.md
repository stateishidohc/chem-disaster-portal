# CLAUDE.md — 化学災害 産業保健ポータル

化学工場の爆発・漏えい時の産業保健対応を学ぶ e ラーニング・用語集・基準値データベースと、
ALOHA（NOAA/EPA）と同じ枠組みの化学物質拡散シミュレーター・爆風圧の目安を 1 つにまとめた静的 PWA（ビルドなし）。
もとになった研修：令和7年度 産業医科大学 産業医学実践研修（2026年2月8日、上野・中原・真鍋・長谷川・立石）。

## ユーザーについて

- 産業医科大学 災害産業保健センターの産業保健研究者（立石清一郎）。**返答は必ず日本語**。
- クレジット表記は「産業医科大学 産業生態科学研究所 災害産業保健センター 立石清一郎」。

## 破ってはいけないルール

1. 数値・係数・書誌は **確認できたものだけ**。確認できないものは載せないか、data/sources.js で `verified: false`。
2. 計算方法は ALOHA 技術文書（Jones et al. 2013, NOAA TM NOS OR&R 43。以下 TD）と同じにし、違う部分（重いガス＝Britter & McQuaid、
   液だまり蒸発＝EPA RMP 式、爆風圧＝TNT 換算＋Kinney & Graham、二相流の容器内温度変化の省略）は「計算方法」ページに必ず明記する。
3. 研修資料のうち「禁転載・転用」の企業内資料（某社の事例写真・社内フロー）は使わない。
4. 基準値（AEGL・PAC・ERPG・IDLH）は data/chemicals.js に集約。更新時は `CD.FETCHED` を変え、アプリの「最新値を取得」（PubChem）で差分を確認。
5. 学習記録・入力値は localStorage のみ。外部送信は PubChem への問い合わせ（物質名・CAS・CID）と地図タイルだけ。

## ファイル

```
index.html            画面の骨組み（スクリプトは ?v=版 付きで読み込む）
css/style.css         デザイン（ライト／ダーク）
js/model.js           気象・拡散幅・ガウスプルーム・発生源・屋内換気・爆風圧（純関数、Node でも動く）
js/dense.js           重いガス（Britter & McQuaid 1988）
js/dispersion.js      モデル選択（Ri）・脅威ゾーン・地点の時系列・LOC の選び方
js/live.js            PubChem PUG-View から AEGL・PAC・ERPG・IDLH を取得（逐次・再試行）
js/sim-ui.js          シミュレーター画面（Leaflet＋地理院タイル）
js/app.js             ルーター、ホーム・学ぶ・ケース演習・物質・爆風圧・用語集・計算方法・出典
data/sources.js       出典一覧（id で参照）
data/chemicals.js     15 物質の基準値・物性・健康影響
data/lessons.js       学習モジュール 8 本＋確認問題
data/case.js          ケース演習（折尾ケミカル、架空）
data/glossary.js      用語集
tests/model.test.js   計算エンジンの検査（node tests/model.test.js）
sw.js / manifest.json PWA。更新時は sw.js の CACHE と index.html の ?v= を上げる
```

## テスト

- `node tests/model.test.js`（すべて合格で終了コード 0）
- 動作確認：~/.claude/launch.json の `chem-portal`（port 8666）。モバイル幅・ダーク／ライトで見る。
- プレビュー用ブラウザでは Service Worker の登録が失敗する（環境の制約。http.server 経由の通常ブラウザでは登録される）。
