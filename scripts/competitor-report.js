const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  const prompt = `
あなたは競合モニタリング専用アシスタントです。

以下の対象について、直近24〜72時間の最新ニュース・発表・公式更新・小規模なお知らせをWeb検索して調査してください。

対象:
- Udemy Business
- LinkedIn Learning
- LinkedIn Career Hub
- Schoo for Business
- グロービス学び放題
- SIGNATE

ルール:
- 一次情報（公式サイト、公式ブログ、公式プレスリリース、公式SNS、IR）を優先
- 一次情報がない場合のみ信頼できる二次情報を使用
- 発表日時は引用元に明記された日時を使い、UTCに変換
- 日時が確認できない情報は採用しない
- 小さい発表は文頭に「（小規模）」を付ける
- 本当に何もなければ「大きな更新なし」と書く
- 各サービスは1〜2件に絞る
- 指定フォーマット以外は出力しない
- 内部思考、作業メモ、途中説明は出力しない
- 完成済みの最終結果だけを出力する

出力フォーマット:
■ Udemy Business
【発表日時】YYYY-MM-DD HH:MM（UTC）
・（最重要ニュースを1〜2件、簡潔に）
・（必要なら2行目）

→ なぜ重要？
（1行でビジネス的な意味を書く）

---

■ LinkedIn Learning
【発表日時】YYYY-MM-DD HH:MM（UTC）
・（同様）

→ なぜ重要？
（同様）

---

■ LinkedIn Career Hub
【発表日時】YYYY-MM-DD HH:MM（UTC）
・（同様）

→ なぜ重要？
（同様）

---

■ Schoo for Business
【発表日時】YYYY-MM-DD HH:MM（UTC）
・（同様）

→ なぜ重要？
（同様）

---

■ グロービス学び放題
【発表日時】YYYY-MM-DD HH:MM（UTC）
・（同様）

→ なぜ重要？
（同様）

---

■ SIGNATE
【発表日時】YYYY-MM-DD HH:MM（UTC）
・（同様）

→ なぜ重要？
（同様）

---

■ 横断トレンド
・（市場全体の動き）

■ 競合示唆
・（競争構造の変化）
・（戦略的示唆）
`;

  const response = await client.responses.create({
    model: "gpt-5.4",
    tools: [{ type: "web_search" }],
    input: prompt,
  });

  const report = response.output_text;

  const res = await fetch(process.env.GOOGLE_CHAT_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ text: report }),
  });

  if (!res.ok) {
    throw new Error(`Google Chat webhook failed: ${res.status} ${await res.text()}`);
  }

  console.log("Report sent successfully");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
