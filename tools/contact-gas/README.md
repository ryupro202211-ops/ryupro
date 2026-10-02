# 問い合わせ専用GASの導入手順

このフォルダーはサイト成果物から除外されます。既存の別用途GASには適用しません。
コード作成・ローカル検証まで済みですが、Google上のプロジェクト作成・権限付与・デプロイ・実メール・本番サイト公開は未実施です。

## 管理アカウントと権限の承認

管理アカウントはユーザー確認済みの `ryuhei.otsuka@gmail.com` です。
通知先 `ryupro202211@gmail.com` は管理アカウントとは別です。手元のブラウザーで上記管理アカウントの新規専用プロジェクトを準備します。メール送信の継続権限とWebアプリ公開は別途確認してから進めます。

必要なOAuth scopeは `https://www.googleapis.com/auth/script.send_mail` のみです。選択アカウントとしてメール送信する継続権限です。Gmail受信箱の読み取り、Drive/Sheetsの読み書き、外部HTTPアクセスの権限は要求しません。
Googleに「メール送信」の継続権限を付与する直前に、アカウント・プロジェクト・scopeを提示して承認を取得してください。新規アカウント・有料契約・既存トークンの保存は不要です。

## プロジェクト準備と接続

1. 確定した既存アカウントでApps Scriptの新規専用プロジェクトを作成。Code.gs・Bridge.html・appsscript.jsonをこのフォルダーの内容で設定します。既存プロジェクトや認証情報を流用しません。
2. `CONTACT.enabled: false` のままで準備。`checkMailAuthorization` はMailAppの残り枠を読むだけでメールを送りませんが、初回は上記権限の付与を求め得るため、権限承認前に実行しません。
3. 権限承認後、Webアプリを「自分として実行」「全員がアクセス」でデプロイ。外部一般利用者向け受付の公開操作なので、アカウント・アクセス範囲を明示して承認後に行います。組織制限で匿名アクセスできない場合は保留。
4. Googleが返した `/macros/s/.../exec` URLだけを `assets/js/contact-settings.js` のendpointへ設定。公開用URLであり秘密値はありません。OAuth token/API keyは設定しません。
5. 実送信しない接続確認はenabled:falseのままで行えます。GAS iframeがGoogle内のsandboxフレームへ入れ子になる環境、メッセージのorigin、匿名アクセス、Cookie制限、google.script.runの到達を実ブラウザーで確認。これは未実施です。
6. 明示的な実メールテスト承認後のみenabled:trueへ変更しGASを新バージョンへ更新。テスト承認案は下記。
7. テスト成功・設定確認後にサイトの最新mainからの作業ブランチでbuild/check/test。サイト本番の公開は別途承認後。公開前に有効なendpointとenabled:trueの一致を確認。

## 送信構造とCORS

サイトはJSON fetchでGASへ直接POSTしません。非表示iframeでGASのHTML Serviceを読み、専用Bridgeから `google.script.run.submitContact` を呼びます。Googleが用意する通信を使うため、GAS側に独自OPTIONS/CORSヘッダーやno-corsの成功偽装を実装しません。

橋渡しは256bitの一時channel、親origin、Google sandbox origin、送信元Window、冪等キーを照合します。名前・メール・本文はURL/queryには載せず、正しい相手とハンドシェイクした後だけpostMessageします。受付IDが返るまで成功表示しません。Google実環境での検証は権限・デプロイ承認後の残作業です。

## 通知・制限・保管

- MailApp送信先は `ryupro202211@gmail.com` に固定。送信者入力はreplyToだけ。入力アドレスへ自動返信しません。
- バックエンドでも必須・長さ・メール・改行によるヘッダー注入・相談種類・流入元・確認フラグ・UUID・honeypotを検証。
- ScriptLockと永続冪等台帳で同じキーの二重メールを防止。内容を変えて同じキーを再利用すると拒否。
- 台帳には受付ID・状態・日時・内容のSHA256ハッシュだけを保存。名前・本文・メールアドレス自体は保存しません。メール別制限にはメールアドレスのハッシュを使用。
- 仮の制限は全体30件/UTC日、同一入力メール3件/UTC日、台帳7日。送信前にMailAppの実残枠も確認。Google側の残枠はアカウント内の他スクリプトと共有。新規受付時に古い台帳を削除し、停止中は自動清掃しません。必要なら専用清掃トリガーを別途検討。
- MailAppを呼ぶ前にpendingを保存。送信後の通信断・書込失敗で結果不明なら自動再送しません。同じキーで再試行すると成功済みは同じ受付ID、pendingはuncertainを返します。メールサービスとScriptPropertiesを同一トランザクションにはできないため、結果不明時は運営者による照合が必要です。
- 一般公開GASはボットから直接呼ばれる可能性があります。honeypotと入力メール別上限は強固な本人認証ではありません。固定通知先と全体上限で消費を制限します。追加CAPTCHAは別サービス・権限・利用条件の判断が必要なので導入していません。
- 通知メールは運営者のGmailに残ります。運営メールの保管期間と上記仮制限の最終確定は必要です。送信者への自動受付メールを希望する場合は、誤送信・悪用対策と追加送信枠を別途設計します。

## 実メールテスト承認案（未実施）

宛先: `ryupro202211@gmail.com`、送信件数: 原則1件。
名前: `ryupro 動作確認`、件名: `【動作確認】お問い合わせフォーム`。
本文: `問い合わせ専用GASの受付・運営者通知・完了画面を確認するためのテストです。お客様からのお問い合わせではありません。`。
入力メール(replyTo): 管理者が指定した既存アドレス。未確定のまま送信しません。
必要性: ローカルモックでは確認できないGoogleの権限・実送信・運営者受信を確かめるため。再試行時の二重通知確認は同一キーで行い、追加メールを発生させない計画です。

## 参考となるGoogle公式仕様

- [HTML Serviceのサーバー通信](https://developers.google.com/apps-script/guides/html/communication)
- [Webアプリの公開・実行者設定](https://developers.google.com/apps-script/guides/web)
- [MailAppのメール送信権限](https://developers.google.com/apps-script/reference/mail/mail-app)
- [Googleの上限](https://developers.google.com/apps-script/guides/services/quotas): 個人アカウントはメール宛先100/日、Workspaceは1,500/日（確認時点）。上限は変更され得ます。

専用の有料サービスや有料Google Cloudリソースを要求する構成にはしていません。既存アカウントの標準Apps Script/MailAppの枠で利用する設計です。利用契約や組織管理制限まで確認したわけではありません。
