const OpenAI = require("openai");
const { IncomingWebhook } = require("@slack/webhook");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);

async function main() {
  const now = new Date().toISOString();

  const prompt = `
############################################
競合モニタリングレポート生成エージェント
############################################

あなたは競合モニタリング専用アシスタントです。
最終アウトプットのみを生成してください。途中思考・メモ・説明は一切出力しないでください。

--------------------------------------------
■ 現在情報
--------------------------------------------
現在日時: ${now}
対象期間: 現在日時から過去72時間
※ただし「過去24時間以内」の情報を最優先とする

--------------------------------------------
■ 調査対象
--------------------------------------------
- Udemy Business
- LinkedIn Learning
- LinkedIn Career Hub
- LinkedIn Career Hub
- Schoo for Business
- グロービス学び放題
- SIGNATE

--------------------------------------------
■ 調査対象の公式ソース（優先）
--------------------------------------------
必ず以下を優先して確認すること：

・公式サイト
・公式ブログ
・公式プレスリリース
・公式SNS（X / LinkedIn等）
・IR / 親会社発表

※一次情報が存在しない場合のみ信頼できる二次情報を使用

--------------------------------------------
■ 採用ルール（厳守）
--------------------------------------------
- 発表日時が明確に確認できる情報のみ採用
- 発表日時は引用元の日時を使用し、UTCに変換
- 日時不明の情報は絶対に採用しない
- 同一内容の転載記事、過去発表の再掲、SEO記事は除外
- 推測・憶測は一切禁止（事実のみ）
- 各サービス最大2件まで
- 小さい発表は文頭に「（小規模）」を付与
- 重要度が低くても競争上意味があれば採用可
- 完全に該当なしの場合のみ「大きな更新なし」と記載
- その場合は必ず「公式情報を確認したが対象期間内の該当更新なし」と明記

--------------------------------------------
■ 出力制約
--------------------------------------------
- 指定フォーマット以外は出力禁止
- 箇条書きは簡潔に
- 無駄な修飾禁止
- 必ず出典URLを付ける
- 内部思考・調査過程は絶対に出力しない

--------------------------------------------
■ 出力フォーマット
--------------------------------------------

■ Udemy Business
【発表日時】YYYY-MM-DD HH:MM（UTC）
・内容要約
・必要なら2件目
【出典】URL

→ なぜ重要？
ビジネス的な意味を1行で記述

---

■ LinkedIn Learning
【発表日時】YYYY-MM-DD HH:MM（UTC）
・内容要約
【出典】URL

→ なぜ重要？
1行

---

■ LinkedIn Career Hub
【発表日時】YYYY-MM-DD HH:MM（UTC）
・内容要約
【出典】URL

→ なぜ重要？
1行

---

■ Schoo for Business
【発表日時】YYYY-MM-DD HH:MM（UTC）
・内容要約
【出典】URL

→ なぜ重要？
1行

---

■ グロービス学び放題
【発表日時】YYYY-MM-DD HH:MM（UTC）
・内容要約
【出典】URL

→ なぜ重要？
1行

---

■ SIGNATE
【発表日時】YYYY-MM-DD HH:MM（UTC）
・内容要約
【出典】URL

→ なぜ重要？
1行

---

■ 横断トレンド
・対象期間内の動きから見える市場トレンドを1〜3点

■ 競合示唆
・競争構造の変化
・各社の戦略意図
・自社が取るべきアクション示唆

############################################
最終結果のみ出力せよ
############################################
`;

  const response = await client.responses.create({
    model: "gpt-5.4",
    tools: [{ type: "web_search" }],
    input: prompt,
  });

  const report = response.output_text;
  const today = new Date().toISOString().slice(0, 10);

  await webhook.send({
    text: `*競合モニタリングレポート ${today}*\n\n${report}`,
  });

  console.log("Report sent to Slack successfully");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
