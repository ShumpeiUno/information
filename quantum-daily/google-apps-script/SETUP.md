# Google Docs・Gmail自動配信

公開GitHub版の最新号をGoogle Apps Scriptが取得し、固定Google Docsへ反映したうえで、同じ本文を`chiral.perturbation@gmail.com`へ直接送信します。GitHubの認証情報や共有シークレットは不要です。

## 作成済みのApps Script

[Quantum Daily Google Automation](https://script.google.com/d/1AEEIayMKYUlVTVLxF77Uo6_HMy1xAV5J3a8Nty042w0JI7HdidBKXC8o/edit)

コードとマニフェストは設定済みです。Googleの仕様上、所有者本人による最初の権限承認だけは代理実行できないため、次の操作を1回行います。

1. 上記Apps Scriptを開きます。
2. 上部の関数選択で`installAutomation`を選びます。
3. 「実行」を押します。
4. Googleアカウントを選び、Google Docsの編集、外部URLの取得、メール送信、時間主導型トリガーの作成を許可します。
5. 実行完了後、固定Google Docが最新号へ更新され、確認メールが届きます。

## 実行時刻

- 公開版生成: 月曜日から金曜日の05:05 JST
- Google Docs更新・Gmail送信: 平日05:40頃
- 日次版の再試行: 平日06:10頃
- Weekend Edition生成: 金曜日20:30 JST
- Weekend Edition更新・送信: 金曜日21:00頃
- 週末版の再試行: 金曜日21:30頃

Apps Scriptの時間主導型トリガーは指定時刻の前後に多少ずれる場合があります。再試行でも同じ内容のハッシュを確認するため、同じ号を二重送信しません。

## 固定閲覧先

- [00_Quantum Brief — CURRENT](https://docs.google.com/document/d/1q-b6YU1YFhqfDY8b3xzGtg-Oq81Twy7QCjoeCutZCZY/edit)
- [01_Quantum Weekend — CURRENT](https://docs.google.com/document/d/1pY9_7_dS_xTptgGNUYqR0Geg0MP4AXTTWPf0WpADJtI/edit)
- [GitHub公開版](https://github.com/ShumpeiUno/information/tree/main/quantum-daily)

## 手動確認

Apps Scriptエディタでは、次の関数も利用できます。

- `syncNow`: 日次版を直ちに更新・再送します。
- `syncWeekendNow`: Weekend Editionを直ちに更新・再送します。
- `automationStatus`: トリガー、最終同期時刻、メール残数を確認します。
- `uninstallAutomation`: このプロジェクトが作成した時間トリガーを削除します。

## セキュリティ

Apps Scriptは公開情報だけを含む`ShumpeiUno/information`のMarkdownを読みます。銀行業務、社内研究、個人メール、その他のGoogle Drive文書は読み取りません。送信先と更新対象のGoogle Docs IDはコード内で固定しています。