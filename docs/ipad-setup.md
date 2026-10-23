# iPadで使う

最小構成は「iPadのBluefyでHTTPSのアプリを開き、センサーへ直接接続する」です。Macは必須ではありません。Safari標準ではWeb Bluetoothが提供されません。

[Bluefy公式ガイド](https://bluefy.app/guide.html)を参照してください。現時点でこのアプリとFITBOXの組み合わせによるiPad実機確認は未実施です。

## 方法1: GitHub Pages（通常はこちら）

[GitHub Pagesの初回設定](github-pages.md)を済ませ、`release`へpushするとHTTPSで公開されます。Bluefyで次のURLを開いてください。

https://geny7i.github.io/fitbox-monitor/

Macの常時起動やローカル証明書のインストールは不要です。公開先は初回デプロイが成功してから利用できます。

## 方法2: MacからLAN内のHTTPS配信

開発時に利用する方法です。iPadとMacを同じネットワークへ接続します。

1. Macに [mkcert](https://github.com/FiloSottile/mkcert) をインストールします（Homebrewなら `brew install mkcert`）。
2. `mkcert -install` で開発用認証局をMacに登録します。
3. Macの「システム設定 → Wi-Fi → 詳細 → TCP/IP」でIPアドレスを確認します。
4. このプロジェクト直下で次を実行します。`192.168.1.10` は実際のMacのアドレスへ置き換えてください。

```bash
mkdir -p .cert
mkcert -key-file .cert/dev-key.pem -cert-file .cert/dev.pem localhost 127.0.0.1 192.168.1.10
npm run dev:https
```

5. `mkcert -CAROOT` で示されるディレクトリの **rootCA.pemだけ** をAirDrop等でiPadへ送り、プロファイルとしてインストールします。iPadの「設定 → 一般 → 情報 → 証明書信頼設定」でこの開発用認証局を信頼します。詳細はmkcert公式READMEのMobile devicesを参照してください。秘密鍵である `rootCA-key.pem` は送信・公開しません。
6. Bluefyで `https://192.168.1.10:5173` を開きます。Bluetooth権限を許可し「センサーを接続」を押します。

MacのIPが変わったら証明書を作り直してください。証明書類は `.cert/` に置きGit管理から除外しています。OSの信頼設定はこの実装作業では変更していません。

## 接続できないとき

- Bluefyを使用し、HTTPSの証明書エラーがないことを確認する。
- iPadのBluetoothとBluefyのBluetooth権限を確認する。
- センサーを数回回して起動する。
- MacのChrome、nRF Connect等との接続を切る。ひとつのセンサーには片方ずつ接続する。
- デバイス名がFITBOXで始まらない場合は「すべてのBLE機器から選ぶ」を試す。
- 画面非表示や切断後は自動一時停止するので、接続状態を確認して手動で再開する。

ブラウザごとに保存領域が異なるため、Macの履歴や補正がiPadへ自動転送されることはありません。
