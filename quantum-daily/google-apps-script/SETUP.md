# Google Docs・Gmail連携

この連携は、GitHub Actionsが作成した最新号を固定Google Docsへ反映し、同じ本文を`chiral.perturbation@gmail.com`へ送信します。Googleの認証情報をGitHubへ直接保存せず、Google Apps ScriptのWebhookを介します。

## 1. Apps Scriptを作成する

1. `https://script.google.com/`で新しいプロジェクトを作成します。
2. 標準の`Code.gs`を削除し、このフォルダの[`Code.gs`](Code.gs)を貼り付けます。
3. プロジェクト名を`Quantum Daily Bridge`などに変更します。

## 2. 共有シークレットを設定する

1. Apps Scriptの「プロジェクトの設定」を開きます。
2. 「スクリプト プロパティ」に`WEBHOOK_SECRET`を追加します。
3. 値には、パスワードマネージャー等で生成した32文字以上のランダム文字列を設定します。メール、Google Docs、GitHubのパスワードは使用しません。

## 3. Webアプリとしてデプロイする

1. 「デプロイ」から「新しいデプロイ」を選びます。
2. 種類は「ウェブアプリ」を選びます。
3. 「次のユーザーとして実行」は自分を選びます。
4. 「アクセスできるユーザー」は`全員`を選びます。Webhook本文の共有シークレットで認証します。
5. 初回の権限確認で、対象Google Docsへの編集とメール送信を許可します。
6. 発行された`/exec`で終わるWebアプリURLを控えます。

## 4. GitHub Actionsのシークレットを追加する

公開リポジトリ`ShumpeiUno/information`の`Settings` → `Secrets and variables` → `Actions`で、次の2つをRepository secretsとして追加します。

- `GOOGLE_APPS_SCRIPT_WEBHOOK_URL`: 手順3で発行されたWebアプリURL
- `GOOGLE_APPS_SCRIPT_WEBHOOK_SECRET`: 手順2と同じランダム文字列

シークレットが未設定の場合も、公開GitHub版とAtomフィードは通常どおり更新されます。設定後は、Google Docs更新とGmail送信も同じ実行内で行われます。

## 5. 動作確認する

GitHubの`Actions` → `Quantum Daily Brief` → `Run workflow`で`daily`を選びます。実行後、次を確認します。

- `quantum-daily/CURRENT.md`が更新されていること
- 固定Google Doc `00_Quantum Brief — CURRENT`が同じ号へ置き換わっていること
- Gmailへ`[Quantum Daily]`のメールが届いていること

金曜夜版は`weekend`を選ぶと、`01_Quantum Weekend — CURRENT`へ書き込みます。

## セキュリティ

WebアプリURLだけでは処理できず、Webhook本文の共有シークレットが一致した場合だけGoogle Docs更新とメール送信を実行します。共有シークレットはリポジトリへコミットせず、Apps ScriptのスクリプトプロパティとGitHub Actions Secretsだけへ保存します。公開情報専用の連携であり、業務用・社内情報は送信しません。
