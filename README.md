# FITBOX Monitor

FITBOX GATEケイデンスセンサーで、運動中の回転数・時間を確認して記録するシンプルなアプリ。iPadでの利用を中心に、Macでもデバッグ・計測できる構成です。

## 対応環境

| 環境 | 実機のBLE計測 | 画面・ログ再生 |
| --- | --- | --- |
| iPad + Bluefy | HTTPSで利用。実機検証待ち | 利用可能 |
| Mac + Chrome | localhostまたはHTTPS。ユーザーによる動作確認済み | 利用可能 |
| iPad + Safari | 標準Web Bluetooth非対応 | 利用可能 |

iPadでは[Bluefy](https://bluefy.app/guide.html)をインストールしてアプリのHTTPS URLを開きます。SafariのみでのBLE接続は初期版の対象に含めていません。Macによる中継は不要です。

## 開発・起動

Node.js 22.12以降（検証環境は24）を使用します。

```bash
npm ci
npm run dev
```

MacのChromeで `http://localhost:5173` を開きます。iPadからMacのLANアドレスへHTTPでアクセスすると画面・再生は確認できますが、実機接続には信頼されたHTTPSが必要です。同一ネットワーク内で接続し、Macのファイアウォールで接続を許可してください。

```bash
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

## 公開・iPadでの確認

`release`ブランチへpushするとGitHub Actionsがテスト・ビルドし、GitHub Pagesへデプロイします。タグやGitHub Releaseの作成は不要です。

公開先（初回デプロイ成功後）: https://geny7i.github.io/fitbox-monitor/

初回はGitHubの **Settings → Pages → Source** を **GitHub Actions** に設定してください。初回公開と以降の更新手順は [GitHub Pages設定](docs/github-pages.md) を参照してください。iPadではBluefyで公開URLを開きます。

ローカルHTTPSの設定は [iPadでの利用手順](docs/ipad-setup.md) を参照してください。

## 使い方

1. センサーを動かし、ほかのBLEアプリとの接続を切る。
2. 「センサーを接続」からFITBOXを選ぶ。名前が異なる場合は「すべてのBLE機器から選ぶ」を使う。
3. 「開始」で計測。現在rpm・運動時間・総ペダル回転数・平均rpmを確認する。
4. 休憩は「一時停止」、継続は「再開」。回転を止めるだけでは時間は止まらない。
5. 「終了して保存」で履歴に残す。停止・切断・終了後も結果は消えない。「新しい計測」で次を開始する。

接続中に「回転の補正」を開くと、実物と画面のペダルの速さを比べられます。色付きペダルの一周が1回転です。「遅くする／速くする」または倍率入力で調整し「この補正を使う」で保存。運動中は補正できず、保存設定は次のセッションから適用します。実物との絶対角度や回転方向は測定していません。

画面を離れたとき、BLE切断時、スリープ等で長い更新停止が生じたときは自動一時停止します。画面復帰や再接続後は手動で再開してください。未受信区間の回転は加算しません。

履歴と補正はブラウザ内保存です。端末やブラウザを変えると共有されません。途中のスナップショットも保存し、再読込時は中断記録として履歴に表示します。「JSON出力」で記録をバックアップできます。初期版にはJSONの再取り込み機能はありません。

## 実機なしで試す

「デバッグ・記録の再生」からforward/reverseを選びます。元の受信間隔で約100秒再生し、forwardは102回、reverseは101回を再現します。再生データには明示的にラベルを付け、BLE計測と混ぜません。旧アプリのrpm/totalは利用せず、生HEXから計算し直します。

## 引き継ぎの要点

- FITBOX-03807のCSCサービス `0x1816`、通知 `0x2A5B` を使用。Battery Serviceは取得できる場合のみ扱う。
- この個体の生Crankは実際のペダル回転のおよそ2倍。初期補正は **生Crank増分 × 0.5**。申告の100回に機械的に合わせない。
- センサー時刻も端末時刻の約2倍で進む。標準CSC式rpmを単純に半分にせず、端末時刻と補正済み回転数の4秒窓から主表示rpmを求める。標準式rpmは診断用。
- WheelはCrankの約3.14倍で独立した実測量とみなさない。近接する2件の通知もカウンターが進むため、受信間隔だけで重複排除しない。
- アニメーションと記録集計は独立。停止後の結果を保持する。
- 地図・Street Viewは保留。心拍・ワット・実速度・距離・カロリーは今回の入力で実測できず対象外。

## 構成・判断記録

- `src/`: 本体。CSC解析、差分・補正・セッション、BLE、保存、UI。
- `tests/`: 生ログによる回帰テスト、保存テスト、ブラウザ操作テスト。
- `reference/fitbox-ble-lab/`: 検証コードとログを独立して保存。本体が実行時に参照コードをimportすることはない。再生用JSONのみビルドに含める。
- `test-project/`: もともとの検証ディレクトリ。変更せずGit管理外で維持。
- [大きな実装判断](docs/implementation-decisions.md)
- [検証結果と実機確認項目](docs/validation.md)
- [元の引き継ぎ資料](reference/fitbox-ble-lab/docs/fitness-monitor-handoff.md)

細部は実際に使ってから調整します。初期版では読みやすい表示、結果の保持、シンプルな接続と補正を優先します。
