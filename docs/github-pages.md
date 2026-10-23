# GitHub Pagesへのデプロイ

## 方針

`main`で開発し、公開したい内容を`release`へ反映してpushするとデプロイする。タグ、GitHub Releaseの作成、バージョン番号の更新は不要。

`.github/workflows/deploy.yml`の1ジョブで依存関係のインストール、単体テスト、ビルド、Pagesへのデプロイを実行する。`main`へのpushではデプロイしない。配信対象は`dist/`のみ。公開時のVite baseは`/fitbox-monitor/`とし、ローカル開発の設定は維持する。

公開先（初回デプロイ成功後）: https://geny7i.github.io/fitbox-monitor/

## GitHub側の初回設定

1. GitHubにまだブランチがない場合、先に`git push -u origin main`でコードを送る。既定ブランチは`main`のままでよい。
2. [Settings → Pages](https://github.com/geny7i/fitbox-monitor/settings/pages) の **Build and deployment → Source** を **GitHub Actions** にする。「Deploy from a branch」は選ばない。デプロイ対象の`release`はワークフロー側で指定している。
3. Actionsが無効化されている場合のみ、**Settings → Actions → General → Actions permissions** でこのワークフローが使うGitHub製Actionsを許可する。既定設定のまま利用可能なら変更不要。
4. 初回デプロイ時に作成される **Settings → Environments → github-pages** の **Deployment branches and tags** が`release`からのデプロイを許可していることを確認する。ブランチ制限がある場合は **Selected branches and tags → Add deployment branch or tag rule → Branch → release** を追加する。Required reviewersは設定不要。制限がなければ変更不要。

リポジトリはPublicであることを確認済み。追加のSecrets、PAT、Variablesは不要。必要な`GITHUB_TOKEN`権限はワークフロー内に指定しているため、リポジトリ全体のWorkflow permissionsをRead and writeへ広げる必要はない。

## 初回公開

GitHub側でSourceを設定した後に実行する。`release`がまだ存在しない場合:

```bash
git push origin main:release
```

現在の`main`をリモートの`release`へ送り、デプロイを開始する。main側の作業ツリーでそのまま作業できる。

## 2回目以降

公開したいコミットを`main`へまとめてから:

```bash
git push origin main
git push origin main:release
```

`release`には直接コミットせず、`main`から進める運用とする。履歴が分岐してpushが拒否された場合はforce pushせず、原因を確認する。

[Actions](https://github.com/geny7i/fitbox-monitor/actions)の **Deploy to GitHub Pages** が成功すると公開完了。iPadのBluefyで公開URLを開けば、ローカル証明書の設定なしに接続確認できる。

## 参考

- [GitHub公式: Pagesの配信元設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub公式: カスタムワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
