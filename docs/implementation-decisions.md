# 実装判断

2026-10-23

- 対象をiPad中心、Macをデバッグ兼用に変更。iPadはBluefy、MacはChromeで同一のWeb Bluetoothアプリを使う案を採用。Safariの標準Web Bluetooth非対応をUIだけでは解決できない。ネイティブアプリやMac中継サーバーは初期版で実装しない。実機検証は別途必要。
- 対応根拠: [Web Bluetooth実装状況](https://github.com/whatwg/bluetooth/blob/main/implementation-status.md)、[Bluefy公式ガイド](https://bluefy.app/guide.html)。iPadでのBLE接続には信頼されたHTTPSが必要。LANのHTTPは画面確認用。
- 低工数を優先し、Vite＋JavaScriptの静的アプリとする。UIフレームワーク、サーバー、アカウント、クラウド同期は導入しない。初期実装はローカルのみ。続く依頼でGitHub Pages公開へ方針変更（下記）。
- 元のtest-projectは変更せず、参照用コピーをreference/fitbox-ble-labとしてGit管理する。本体はsrc内に独立して実装し参照コードを実行時importしない。
- 補正は生Crank増分に適用し初期値0.5。現在rpmは端末の単調時計の4秒窓で算出し、開始2秒は計測中。最終回転から5秒で0。標準CSC式rpmは診断のみ。
- 時間は開始から一時停止/終了まで。こぐのを止めても時間は進む。BLE切断、画面非表示、端末スリープによる10秒超の更新停止では自動一時停止。再開は手動で基準を再取得する。
- リセットや不連続は再基準化。10秒超の受信間隔、非単調時刻、非ゼロ回転で時刻差ゼロ、過大な差分（最低12 raw、または経過秒×20 rawを超える）を除外。閾値は製品仕様ではなく初期の保守的判断。
- 描画はrpmの積分、記録はカウンター差分と分離。補正中は運動を開始しない。倍率保存は次のセッションから適用。
- 履歴と個体別補正はlocalStorage。異なるブラウザ/端末間で自動共有しない。終了結果と中断スナップショットを保存し、再読込時には履歴から確認できる。再読込後のセッション自動復帰はしない。

- iPadの試用方法として静的HTTPS配信とMac上の開発用HTTPSを用意。後者はユーザーがmkcertで発行・信頼した証明書を`.cert/`へ置く。OSの証明書信頼設定は自動変更しない。SafariだけでBLEを使う要件が必要になった場合は接続方式を再検討する。

## GitHub Pages対応

- ユーザーの希望により公開先をGitHub Pagesとし、`release`ブランチへのpushで公開する。`main`は開発用。ddda-stat-tunerのタグ運用は持ち込まない。
- 1つのジョブで単体テスト、Viteビルド、Pagesの公式Actionsによる配信を行う。ブラウザテストはローカルで行い、デプロイごとのブラウザ導入は省く。
- 配信用baseはビルド引数で`/fitbox-monitor/`を指定する。通常のローカル起動は従来どおり。配信するのは`dist/`のみ。
- 初回のGitHub設定、ブランチ運用、公開URLは[github-pages.md](github-pages.md)へ記載。Macでの動作確認はユーザーより報告済み、iPadは公開後の実機確認待ち。
