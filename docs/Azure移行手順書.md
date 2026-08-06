# Azure移行 手順書（3時間コース）

> **この手順書の対象**：相続プラットフォームを Render（アメリカ・無料プラン）から **Azure（東京）** へ引っ越す作業。
> **前提知識**：不要です。コマンドはコピペでOK。
> **重要**：この作業で **データベース（Supabase）は一切触りません**。壊れるものは何もなく、失敗したらRenderに戻すだけです。

---

## 0. これから何をするのか（1分で理解）

いまアプリは **Render というアメリカの会社の無料サーバー** で動いています。
これを **Azure（Microsoft）の東京** に引っ越します。

やることは、たった3つです。

| # | やること | たとえると |
|---|---|---|
| 1 | アプリを「箱」に詰める | 引っ越しの荷造り（段ボール1個） |
| 2 | その箱をAzureに置く | 新居に段ボールを運ぶ |
| 3 | 電源を入れて動作確認 | 新居で電気をつけて確認 |

**データ（案件情報）は動かしません。** Supabaseに置いたままで、新しいアプリからそのまま繋がります。

**Renderは止めません。** 新しい方が動くのを確認するまで、両方動かしたままにします（並行稼働）。

---

## 1. 準備するもの

作業を始める前に、手元にこれらを用意してください。

- [ ] **クレジットカード**（Azureの契約に必要。※すぐ課金はされません）
- [ ] **携帯電話**（本人確認のSMSを受け取ります）
- [ ] **Microsoftアカウント**（Outlook/Hotmail等。無ければ作成します）
- [ ] **このプロジェクトのフォルダ**：`C:\Users\sugur\Deploy\相続プラットフォーム`

---

## 2. 3時間のタイムテーブル

| 時間 | STEP | 内容 |
|---|---|---|
| 0:00 – 0:20 | STEP 1 | Azureアカウントを作る |
| 0:20 – 0:35 | STEP 2 | Azure CLI（操作ツール）を入れる |
| 0:35 – 0:45 | STEP 3 | 環境変数（7個の設定値）を手元に集める |
| 0:45 – 1:05 | STEP 4 | Azureにログイン・置き場所を作る |
| 1:05 – 1:30 | STEP 5 | アプリを箱に詰める（クラウドでビルド） |
| 1:30 – 1:50 | STEP 6 | アプリを起動する |
| 1:50 – 2:30 | STEP 7 | 動作確認 |
| 2:30 – 2:40 | STEP 8 | 相続ステーション開発者にURL共有 |
| 2:40 – 3:00 | 予備 | トラブル対応の余白 |

---

## STEP 1. Azureアカウントを作る（20分）

### やること
Azureと契約します。個人名義でOK。あとで支払いカードだけオーシャンのものに変更できます。

### 手順

1. ブラウザで **https://azure.microsoft.com/ja-jp/free/** を開く
2. 「**無料で始める**」をクリック
3. Microsoftアカウントでサイン
   イン（無ければ「アカウントを作成」）
4. 画面の案内に従って入力
   - 国／地域：**日本**
   - 氏名・住所・電話番号
5. **携帯電話でSMS認証**（届いた番号を入力）
6. **クレジットカード情報を入力**
   - ⚠️ 本人確認のためで、**すぐに課金はされません**
   - 最初は無料枠から使われます
7. 契約書に同意 → 完了

### ✅ できたらOKの確認
ブラウザで **https://portal.azure.com** を開いて、青い管理画面が表示されればOK。

> **つまずいたら**：カードが弾かれる場合はデビットカードやプリペイドは不可のことがあります。通常のクレジットカードを使ってください。

---

## STEP 2. Azure CLI を入れる（15分）

### やること
Azureをコマンドで操作する道具を、パソコンに入れます。
（画面をポチポチするより、コピペの方が確実で速いので）

### 手順

1. ブラウザで **https://aka.ms/installazurecliwindows** を開く
   → インストーラー（`.msi`ファイル）がダウンロードされます
2. ダウンロードした `.msi` をダブルクリック
3. 「Next」→「同意する」→「Install」と進む（全部そのままでOK）
4. 「Finish」で完了
5. **PowerShellを一度すべて閉じて、開き直す**（重要！閉じないと認識されません）

### ✅ できたらOKの確認

PowerShellを開いて、下をコピペして実行：

```powershell
az version
```

バージョン番号（`azure-cli 2.xx.x` のような表示）が出ればOKです。

> **つまずいたら**：`az は認識されません` と出たら、PowerShellを閉じ忘れています。**すべてのPowerShellウィンドウを閉じて開き直して**ください。

---

## STEP 3. 環境変数（7個の設定値）を手元に集める（10分）

### やること
アプリが動くのに必要な「鍵」が7個あります。これを次のステップで使うので、メモ帳に貼っておきます。

### 手順

1. **メモ帳を開く**（あとでコピペするため）
2. エクスプローラーで `C:\Users\sugur\Deploy\相続プラットフォーム` を開く
3. **`.env.local`** というファイルを**メモ帳で開く**
   （ダブルクリックで開けない場合：右クリック →「プログラムから開く」→「メモ帳」）
4. 中身に以下の行があります。**それぞれの `=` の右側の値**を、作業用メモ帳にコピーしておく

| 変数名 | 何の鍵か |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | データベースの住所 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | データベースの一般用の鍵 |
| `SUPABASE_SERVICE_ROLE_KEY` | データベースの管理者用の鍵 |
| `ANTHROPIC_API_KEY` | AI（Claude）の鍵 |
| `INBOUND_API_KEY` | 相続ステーション連携用の鍵 |
| `INBOUND_HMAC_SECRET` | 相続ステーション連携の署名用 |

> **`.env.local` に無い項目があったら**：Renderの管理画面 → 該当サービス → 左メニュー「**Environment**」から確認できます。

### ⚠️ 取り扱い注意
これらは**パスワードと同じ**です。チャットやメールに貼らないでください。

### ✅ できたらOKの確認
メモ帳に6〜7個の値が揃っていればOK。

---

## STEP 4. Azureにログインして、置き場所を作る（20分）

### やること
Azureにログインし、「アプリを置く土地」を用意します。

### 手順

**PowerShellを開いて、上から順に1つずつ実行**してください。

#### 4-1. ログイン

```powershell
az login
```

→ ブラウザが開くので、STEP 1で作ったアカウントでログイン。
→ PowerShellに戻って、契約情報が表示されればOK。

#### 4-2. 名前を決めておく（★ここ重要）

以下をコピペして実行します。
**`$ACR` の行だけ、末尾の数字を自分の好きな4桁に変えてください**（世界で1つだけの名前が必要なため）。

```powershell
$RG = "rg-souzoku"; $LOC = "japaneast"; $ACR = "acrsouzoku0806"; $APP = "souzoku-platform"; $ENVN = "cae-souzoku"
```

> ⚠️ **PowerShellを閉じるとこの設定は消えます。** 閉じてしまったら、この行をもう一度実行してください。

#### 4-3. 準備コマンド（3つまとめて）

```powershell
az extension add --name containerapp --upgrade --allow-preview true
```

```powershell
az provider register --namespace Microsoft.App
```

```powershell
az provider register --namespace Microsoft.OperationalInsights
```

> この登録は裏で数分かかりますが、**待たずに次へ進んでOK**です。

#### 4-4. 土地（リソースグループ）を作る

```powershell
az group create --name $RG --location $LOC
```

#### 4-5. 箱の保管庫（コンテナレジストリ）を作る

```powershell
az acr create --resource-group $RG --name $ACR --sku Basic --admin-enabled true
```

> **エラー `already in use` が出たら**：その名前は他の人が使っています。4-2に戻って `$ACR` の数字を変えて、4-5をやり直してください。

### ✅ できたらOKの確認

```powershell
az group show --name $RG --query name -o tsv
```

`rg-souzoku` と表示されればOK。

---

## STEP 5. アプリを箱に詰める（25分）

### やること
アプリを1つの「箱（コンテナイメージ）」にまとめます。
**あなたのパソコンではなく、Azureのクラウド上でビルドします**（＝PCにDockerを入れる必要なし）。

### 手順

#### 5-1. プロジェクトフォルダに移動

```powershell
cd "C:\Users\sugur\Deploy\相続プラットフォーム"
```

#### 5-2. Supabaseの2つの値を変数に入れる

以下の `ここに貼る` の部分を、**STEP 3でメモした値に置き換えて**実行してください。
（ダブルクォート `"` は消さないでください）

```powershell
$SUPA_URL = "ここにNEXT_PUBLIC_SUPABASE_URLの値を貼る"
```

```powershell
$SUPA_ANON = "ここにNEXT_PUBLIC_SUPABASE_ANON_KEYの値を貼る"
```

#### 5-3. ビルド実行（★5〜15分かかります）

```powershell
az acr build --registry $ACR --image souzoku-platform:v1 --build-arg NEXT_PUBLIC_SUPABASE_URL=$SUPA_URL --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPA_ANON .
```

> 最後の **` .`（半角スペース＋ドット）を消さないでください**。「今いるフォルダを送る」という意味です。

画面に大量の文字が流れます。これは正常です。コーヒーでも飲んで待ちましょう。

### ✅ できたらOKの確認
最後に **`Run ID: xxx was successful`** と緑っぽく表示されればビルド成功です。

> **失敗したら**：末尾に出ているエラー文をコピーして相談してください。多くは「変数の貼り間違い」か「ドット忘れ」です。

---

## STEP 6. アプリを起動する（20分）

### やること
詰めた箱をAzureに置いて、電源を入れます。

### 手順

#### 6-1. 保管庫の鍵を取り出す

```powershell
$ACR_USER = az acr credential show --name $ACR --query username -o tsv
```

```powershell
$ACR_PASS = az acr credential show --name $ACR --query "passwords[0].value" -o tsv
```

#### 6-2. 残りの環境変数を変数に入れる

`ここに貼る` を、STEP 3でメモした値に置き換えて実行してください。

```powershell
$SVC_KEY = "ここにSUPABASE_SERVICE_ROLE_KEYの値を貼る"
```

```powershell
$ANTHROPIC = "ここにANTHROPIC_API_KEYの値を貼る"
```

```powershell
$INBOUND_KEY = "ここにINBOUND_API_KEYの値を貼る"
```

```powershell
$INBOUND_SEC = "ここにINBOUND_HMAC_SECRETの値を貼る"
```

#### 6-3. 実行環境を作る（3〜5分かかります）

```powershell
az containerapp env create --name $ENVN --resource-group $RG --location $LOC
```

#### 6-4. アプリを作成して起動

以下は**1行のコマンド**です。改行せずにそのままコピペしてください。

```powershell
az containerapp create --name $APP --resource-group $RG --environment $ENVN --image "$ACR.azurecr.io/souzoku-platform:v1" --registry-server "$ACR.azurecr.io" --registry-username $ACR_USER --registry-password $ACR_PASS --target-port 3000 --ingress external --min-replicas 1 --max-replicas 3 --cpu 0.5 --memory 1.0Gi --secrets "svc-key=$SVC_KEY" "anthropic-key=$ANTHROPIC" "inbound-key=$INBOUND_KEY" "inbound-sec=$INBOUND_SEC" --env-vars "NODE_ENV=production" "NEXT_PUBLIC_SUPABASE_URL=$SUPA_URL" "NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPA_ANON" "SUPABASE_SERVICE_ROLE_KEY=secretref:svc-key" "ANTHROPIC_API_KEY=secretref:anthropic-key" "INBOUND_API_KEY=secretref:inbound-key" "INBOUND_HMAC_SECRET=secretref:inbound-sec"
```

> パスワード類は `--secrets` で登録し、画面に平文で出ないようにしています。

#### 6-5. URLを確認する

```powershell
az containerapp show --name $APP --resource-group $RG --query properties.configuration.ingress.fqdn -o tsv
```

→ `souzoku-platform.xxxxx.japaneast.azurecontainerapps.io` のような文字列が出ます。
**これが新しい本番URLです。** 頭に `https://` を付けてブラウザで開いてください。

### ✅ できたらOKの確認
ブラウザでログイン画面が表示されればOK！

> **真っ白／エラーになったら**：起動に1〜2分かかることがあります。1分待って再読み込みしてください。それでもダメなら下の「つまずいたとき」へ。

---

## STEP 7. 動作確認（40分）

**Renderの旧環境と見比べながら**、以下を順にチェックしてください。

| # | 確認項目 | 見るポイント |
|---|---|---|
| 1 | ログインできる | メール／パスワードで入れる |
| 2 | 案件一覧が表示される | データが空でない＝DB接続OK |
| 3 | 案件詳細が開く | タブが正常に出る |
| 4 | マイページのアラートが出る | 要確認／要注意バナーの件数 |
| 5 | **戸籍のOCRが動く** | ← AIの鍵が効いているか確認 |
| 6 | **請求書Excelが生成できる** | ファイル生成機能の確認 |
| 7 | 到着物受信簿が開く | 拠点選択が出る |
| 8 | 面談シート入力（/intake）が開く | スマホでも確認 |
| 9 | オーダーシートが開く | |
| 10 | マニュアル（/manual）が開く | ← ファイル同梱の確認 |

### ⚠️ 特に重要な3つ
- **2番（案件一覧）** … これが出れば、データベース接続は成功です
- **5番（OCR）** … これが動けば、AIの鍵は正常です
- **10番（マニュアル）** … これが出れば、ファイル同梱は正常です

### ログを見たいとき

```powershell
az containerapp logs show --name $APP --resource-group $RG --tail 50
```

---

## STEP 8. 相続ステーション開発者にURLを共有（10分）

連携の受信口が新しいURLに変わります。以下を先方に伝えてください。

```
【新しい連携先URL】
https://（STEP 6-5で出たURL）/api/integration

※ 旧URL（Renderのもの）は、切替完了後に停止します。
※ 認証キー（INBOUND_API_KEY / HMAC）は変更ありません。
```

> **旧Renderもしばらく動かしたまま**にしておけば、切替前後で連携が途切れません。

---

## 更新のやり方（2回目以降・開発を続けるとき）

コードを直したあと、Azureに反映する手順です。**2コマンドだけ**です。

```powershell
cd "C:\Users\sugur\Deploy\相続プラットフォーム"
```

```powershell
$RG = "rg-souzoku"; $ACR = "acrsouzoku0806"; $APP = "souzoku-platform"; $SUPA_URL = "（URLを貼る）"; $SUPA_ANON = "（ANON KEYを貼る）"
```

**① 新しい箱を作る**（`v2` の数字を毎回増やす）

```powershell
az acr build --registry $ACR --image souzoku-platform:v2 --build-arg NEXT_PUBLIC_SUPABASE_URL=$SUPA_URL --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPA_ANON .
```

**② 差し替える**

```powershell
az containerapp update --name $APP --resource-group $RG --image "$ACR.azurecr.io/souzoku-platform:v2"
```

---

## つまずいたとき（トラブル集）

| 症状 | 原因 | 対処 |
|---|---|---|
| `az は認識されません` | PowerShellを開き直していない | 全部閉じて開き直す |
| `$RG` などが空になる | PowerShellを閉じた | STEP 4-2 の行を再実行 |
| ACR作成で `already in use` | 名前が世界で重複 | `$ACR` の数字を変える |
| ビルドが `npm ci` で失敗 | ネットワーク一時障害 | もう一度同じコマンドを実行 |
| 画面は出るがデータが空 | Supabaseの値が違う | STEP 3の値を再確認して6-4をやり直す |
| ログイン画面が真っ白 | NEXT_PUBLIC が未設定でビルドされた | STEP 5-2の値を確認して**ビルドからやり直す** |
| OCRだけ動かない | `ANTHROPIC_API_KEY` が違う | 下の「環境変数だけ直す」を実行 |
| 502 / タイムアウト | まだ起動中 | 1〜2分待って再読み込み |

### 環境変数だけ直したいとき

```powershell
az containerapp update --name $APP --resource-group $RG --set-env-vars "ANTHROPIC_API_KEY=secretref:anthropic-key"
```

### すべてやり直したいとき（土地ごと削除）

```powershell
az group delete --name $RG --yes
```

> データベースには一切影響しません。作り直しはSTEP 4から。

---

## 後日やること（今日はやらなくてよい）

- [ ] **独自ドメインの設定**（`https://xxx.co.jp` のようにする）
- [ ] **支払いカードをオーシャンのものに変更**
- [ ] **Renderの停止**（新環境が安定してから）
- [ ] **AIをAzure経由（Claude on Foundry）に切替**（コード変更あり・別途）
- [ ] **監視／アラートの設定**

---

## 参考：今日つくったもの

| 名前 | 種類 | 役割 |
|---|---|---|
| `rg-souzoku` | リソースグループ | すべてを入れる「土地」 |
| `acrsouzoku****` | コンテナレジストリ | アプリの箱の「保管庫」 |
| `cae-souzoku` | Container Apps 環境 | アプリを動かす「区画」 |
| `souzoku-platform` | Container App | **アプリ本体** |

**月額の目安：合計 5,000〜8,000円**（0.5 CPU / 1GB 構成の場合）
動きが重ければ、以下でスペックを上げられます。

```powershell
az containerapp update --name $APP --resource-group $RG --cpu 1.0 --memory 2.0Gi
```
