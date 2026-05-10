const OpenAI = require("openai");
const nodemailer = require("nodemailer");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h1|h2|h3|h4|li|br)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeJsonParse(text) {
  if (!text) {
    throw new Error("Empty response. JSON could not be parsed.");
  }

  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");

    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const sliced = cleaned.slice(jsonStart, jsonEnd + 1);
      try {
        return JSON.parse(sliced);
      } catch {
        throw new Error(`JSON parse failed. Raw output:\n${text}`);
      }
    }

    throw new Error(`JSON parse failed. Raw output:\n${text}`);
  }
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isWithinPeriod(publishedAtUtc, startDate, endDate) {
  const publishedAt = new Date(publishedAtUtc);

  if (Number.isNaN(publishedAt.getTime())) {
    return false;
  }

  return publishedAt >= startDate && publishedAt <= endDate;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function shouldExcludeByCompany(company) {
  const normalized = normalizeText(company).toLowerCase();

  return (
    normalized.includes("signate") ||
    normalized.includes("ｓｉｇｎａｔｅ")
  );
}

function normalizeCategory(category) {
  const value = normalizeText(category);

  const allowed = [
    "コンテンツの公開",
    "新機能の追加",
    "イベント、ニュース",
    "パートナーシップ",
    "その他",
  ];

  return allowed.includes(value) ? value : "その他";
}

function normalizeImportance(importance) {
  const value = normalizeText(importance);

  const allowed = ["高", "中", "低"];

  return allowed.includes(value) ? value : "低";
}

function validateAndFilterCandidates(rawCandidates, startDate, endDate) {
  if (!Array.isArray(rawCandidates)) {
    console.warn("rawCandidates is not an array.");
    return [];
  }

  const validItems = [];

  for (const item of rawCandidates) {
    const company = normalizeText(item.company);
    const title = normalizeText(item.title);
    const url = normalizeText(item.url);
    const publishedAtUtc = normalizeText(item.published_at_utc);
    const dateEvidence = normalizeText(item.date_evidence);
    const sourceType = normalizeText(item.source_type);

    const rejectReasons = [];

    if (!company) rejectReasons.push("missing company");
    if (!title) rejectReasons.push("missing title");
    if (!url) rejectReasons.push("missing url");
    if (!publishedAtUtc) rejectReasons.push("missing published_at_utc");

    if (url && !isValidUrl(url)) {
      rejectReasons.push("invalid url");
    }

    if (company && shouldExcludeByCompany(company)) {
      rejectReasons.push("excluded company");
    }

    if (publishedAtUtc && !isWithinPeriod(publishedAtUtc, startDate, endDate)) {
      rejectReasons.push("outside period");
    }

    if (rejectReasons.length > 0) {
      console.warn("Rejected candidate:", {
        title,
        company,
        url,
        published_at_utc: publishedAtUtc,
        date_evidence: dateEvidence,
        reasons: rejectReasons,
      });
      continue;
    }

    if (!dateEvidence) {
      console.warn("Candidate accepted but missing date_evidence:", {
        title,
        company,
        url,
        published_at_utc: publishedAtUtc,
      });
    }

    validItems.push({
      title,
      company,
      category: normalizeCategory(item.category),
      importance: normalizeImportance(item.importance),
      published_at_utc: new Date(publishedAtUtc).toISOString(),
      date_evidence: dateEvidence,
      url,
      source_type: sourceType || "不明",
      what_happened: normalizeText(item.what_happened),
      why_it_matters: normalizeText(item.why_it_matters),
      japan_market_impact: normalizeText(item.japan_market_impact),
      japan_market_impact_reason: normalizeText(item.japan_market_impact_reason),
      linkedin_scope: normalizeText(item.linkedin_scope),
      competition_with_udemy_business: normalizeText(
        item.competition_with_udemy_business
      ),
    });
  }

  return validItems
    .sort((a, b) => new Date(b.published_at_utc) - new Date(a.published_at_utc))
    .slice(0, 3);
}

function buildCandidatePrompt({ now, period, periodStartIso, periodEndIso }) {
  return `
############################################
競合ニュース候補抽出エージェント
############################################

あなたは、Udemy Business向けの競合ニュースレポートに使える「候補ニュース」だけを抽出する調査エージェントです。

このステップでは、HTMLメールを作成してはいけません。
出力はJSONのみです。
Markdown、コードブロック、説明文、前置き、後書きは出力しないでください。

--------------------------------------------
■ 現在情報
--------------------------------------------
現在日時: ${now}
対象期間: ${period}
対象期間開始: ${periodStartIso}
対象期間終了: ${periodEndIso}

--------------------------------------------
■ 最重要ルール
--------------------------------------------

このタスクでは、鮮度の誤りを重大な失敗とします。

対象期間内に発表・公開・更新された情報だけを候補にしてください。

ただし、日付情報の扱いは以下の通りです。

- ページ本文内で発表日・公開日・更新日を確認できる場合は、その日付を published_at_utc に入れてください
- ページ本文内の日付が取りづらいが、公式ページ・公式配信ページ・公式SNSなどで対象期間内と判断できる場合は、補助根拠を date_evidence に書いてください
- 検索結果の日付だけを根拠にしてはいけません
- 対象期間外の情報は採用してはいけません
- 古いニュースで穴埋めしてはいけません

対象期間内の有効なニュースが0件の場合は、空の配列を返してください。

--------------------------------------------
■ 必ず確認したい検索観点
--------------------------------------------

以下のように、公式サイト・公式ページを中心に確認してください。

- LinkedIn Learning の公式ニュース、公式ブログ、LinkedIn公式ページ
- LinkedIn Career Hub の公式ニュース、公式ブログ、LinkedIn公式ページ
- Schoo公式のお知らせページ、Schoo for Business関連ページ
- グロービス学び放題、GLOBIS学び放題、GLOBIS知見録、公式コースページ、公式配信ページ
- Udemy Business公式情報は自社参考として扱う

検索するときは、競合名だけでなく、以下のような語も組み合わせてください。

- 2026年5月
- May 2026
- お知らせ
- ニュース
- 新機能
- 講座
- 授業
- AI
- リスキリング
- 法人向け
- スキル
- キャリア

--------------------------------------------
■ 除外する情報
--------------------------------------------

以下の情報は、関連性が高くても必ず除外してください。

- 対象期間外の情報
- 検索結果の日付だけが新しい情報
- 古い記事の再掲
- SEO記事、まとめ記事
- 出典URLがない情報
- 推測、噂、未確認情報
- SIGNATEに関する情報
- 競合名が含まれるだけで、法人向け学習・人材育成との関係が薄い情報

--------------------------------------------
■ 調査対象
--------------------------------------------

【競合として扱う対象】
- LinkedIn Learning
- LinkedIn Career Hub
- Schoo for Business
- グロービス学び放題

【自社として扱う対象】
- Udemy Business

Udemy Businessは競合として扱わないでください。
Udemy Businessの情報を採用する場合は、自社参考として扱ってください。
ただし、競合ニュース候補としては原則優先度を下げてください。

【除外対象】
- SIGNATE

SIGNATEに関するニュースは、対象期間内であっても採用しないでください。

--------------------------------------------
■ 優先して見る領域
--------------------------------------------

以下に関係する情報を優先してください。

- 法人向け学習サービス
- 企業研修
- リスキリング
- DX人材育成
- AI人材育成
- データ分析人材育成
- スキル可視化
- スキルマップ
- キャリア支援
- LMS / LXP
- 学習データ活用
- 人的資本経営
- 生成AI活用
- 企業向け導入事例
- 価格・プラン
- パートナー連携
- プロダクト機能追加
- コンテンツ拡充
- 大型キャンペーン
- IR / 業績 / 事業戦略

--------------------------------------------
■ 情報ソースの優先順位
--------------------------------------------

情報源は以下を優先してください。

1. 公式サイト
2. 公式ブログ
3. 公式プレスリリース
4. 公式SNS
5. IR / 決算資料 / 親会社発表
6. 公的機関・業界団体の発表
7. 信頼できる報道機関・専門メディア
8. その他の二次情報

一次情報がある場合は、必ず一次情報を優先してください。
二次情報は、一次情報で確認できない背景補足に限定してください。

--------------------------------------------
■ ニュース区分
--------------------------------------------

各候補には、必ず以下のいずれかの category を付けてください。

- コンテンツの公開
- 新機能の追加
- イベント、ニュース
- パートナーシップ
- その他

区分は、テーマ名ではなく「実際に何が発表・公開・更新されたのか」で判断してください。

例：
- AI活用の新講座公開 → コンテンツの公開
- Schooの新しい授業公開 → コンテンツの公開
- AIレコメンド機能の追加 → 新機能の追加
- AI人材育成ウェビナー開催 → イベント、ニュース
- AI研修会社との協業発表 → パートナーシップ
- AI事業方針の発表 → その他

--------------------------------------------
■ 重要度
--------------------------------------------

各候補には、必ず以下のいずれかの importance を付けてください。

- 高
- 中
- 低

重要度は、以下を組み合わせて判断してください。

- ニュース区分
- Udemy Businessとの競争関係
- 法人顧客への影響
- 営業・マーケティング・商品開発・コンテンツ作成への示唆
- 一時的な話題か、継続的な競争軸になりそうか
- LinkedInまたはUdemy Business関連の場合は、日本市場への影響

「AI」「リスキリング」「スキル可視化」など重要テーマを含んでいても、単なるコンテンツ公開であれば原則として高にしないでください。
一方で、コンテンツ公開であっても、競合のポジショニング変化や顧客ニーズの変化が明確に見える場合は中として扱ってよいです。

--------------------------------------------
■ LinkedIn関連ニュースの扱い
--------------------------------------------

LinkedIn関連ニュースを採用する場合は、以下を明確にしてください。

- LinkedIn全体の話か
- LinkedIn Learningの話か
- LinkedIn Career Hubの話か
- Udemy Businessとの競争関係は強いか、弱いか
- 日本市場への影響
- その判断根拠

LinkedInの採用、広告、SNS機能、一般的な雇用市場レポートなどは、Udemy Businessとの競争関係が限定的な場合、大きく扱わないでください。

--------------------------------------------
■ 日本市場への影響
--------------------------------------------

japan_market_impact は、以下の場合のみ記入してください。

- Udemy Businessに関する情報を自社参考として採用する場合
- LinkedIn Learning、LinkedIn Career Hub、またはLinkedIn全体に関するニュースを採用する場合

Schoo for Business、グロービス学び放題に関するニュースでは、japan_market_impact は空文字にしてください。

日本市場への影響は以下のいずれかにしてください。

- 高
- 中
- 低
- 不明

日本向け提供、日本語対応、日本企業導入、日本市場向け発表が確認できない場合は断定しないでください。

--------------------------------------------
■ 出力形式
--------------------------------------------

以下のJSON形式のみで出力してください。

{
  "candidates": [
    {
      "title": "ファクトベースの見出し",
      "company": "対象企業名",
      "category": "コンテンツの公開 / 新機能の追加 / イベント、ニュース / パートナーシップ / その他",
      "importance": "高 / 中 / 低",
      "published_at_utc": "YYYY-MM-DDTHH:mm:ss.sssZ",
      "date_evidence": "日付判断の根拠。例：ページ本文に「2026年5月8日 12:00」と記載 / 公式配信ページで2026年5月5日配信と確認",
      "is_within_period": true,
      "url": "https://...",
      "source_type": "公式サイト / 公式ブログ / 公式プレスリリース / 公式SNS / IR / 報道機関 / その他",
      "what_happened": "何が起きたか。事実のみを短く書く",
      "why_it_matters": "なぜ社内メンバーが気にした方がよいのかを短く書く",
      "linkedin_scope": "LinkedIn全体 / LinkedIn Learning / LinkedIn Career Hub / 空文字",
      "competition_with_udemy_business": "強い / 弱い / 不明 / 空文字",
      "japan_market_impact": "高 / 中 / 低 / 不明 / 空文字",
      "japan_market_impact_reason": "日本市場への影響判断の根拠。不要な場合は空文字"
    }
  ]
}

候補が0件の場合は、以下を返してください。

{
  "candidates": []
}

############################################
JSONのみを出力してください
############################################
`;
}

function buildHtmlPrompt({ now, period, verifiedItems }) {
  return `
############################################
Udemy Business向け
競合ニュース・インサイト Weekly HTMLメール生成エージェント
############################################

あなたは、Udemy Businessの社内メンバー向けに、競合ニュースを「読みたくなる短い社内ニュースレター」として整理するアシスタントです。

このメールの目的は、ニュースを網羅することではありません。
営業・マーケティング・商品開発・コンテンツ作成のメンバーが、競合の動きを気軽に読み、少しずつ競合に対する感度を高めることです。

出力は「調査レポート」ではなく、「今週の競合の空気をつかむ読み物」にしてください。

--------------------------------------------
■ 現在情報
--------------------------------------------
現在日時: ${now}
対象期間: ${period}

--------------------------------------------
■ 最重要ルール
--------------------------------------------

このステップでは、追加調査をしてはいけません。
以下の「検証済みニュース」だけを使ってHTMLメールを作成してください。

検証済みニュースに含まれないニュース、背景情報、出典URLを追加してはいけません。
検証済みニュースが0件の場合は、0件として正直に書いてください。
古いニュースで穴埋めしてはいけません。

--------------------------------------------
■ 検証済みニュース
--------------------------------------------

${JSON.stringify(verifiedItems, null, 2)}

--------------------------------------------
■ 調査対象
--------------------------------------------

【競合として扱う対象】
- LinkedIn Learning
- LinkedIn Career Hub
- Schoo for Business
- グロービス学び放題

【自社として扱う対象】
- Udemy Business

Udemy Businessは競合として扱わないでください。
掲載する場合は「自社参考」と明記し、競合ニュースと混同しないようにしてください。
ただし、Udemy Business専用の独立セクションは作らないでください。

【除外対象】
- SIGNATE

SIGNATEに関するニュースは出力しないでください。

--------------------------------------------
■ 文章トーン
--------------------------------------------

文章は、少し口語体でよいです。
ただし、社内メールとして失礼にならないトーンにしてください。

避ける文体：
- 監査レポートのように硬い文章
- 箇条書きだけの無機質な文章
- 「以下の通り整理します」のような事務的な始まり
- 過度に煽る表現
- 根拠のないストーリー化
- 競合を過度に持ち上げる表現
- 断定しすぎる表現
- 評価表のような無機質な表現

本文中では、以下のような評価表っぽい表現を使わないでください。

- 競争インパクトは中程度です
- 競争インパクトは低めです
- 重要度は低めです
- 重要度は中程度です
- 直接的な競争インパクトは限定的です

重要度の高低はラベルに任せてください。
本文では、なぜ気になるのか、どの場面で参考になるのかを自然な言葉で説明してください。

--------------------------------------------
■ 見出しルール
--------------------------------------------

冒頭の見出しは、読者が「どういうこと？」と思って読み進めたくなる問い・仮説・一言でよいです。

一方で、「今週、気になった競合の動き」に掲載する各ニュースの見出しは、必ずファクトベースにしてください。
見出しだけを読んでも、何が起きたかが分かるようにしてください。

読み物らしさは、ニュース見出しではなく、冒頭・今週の流れ・ここが気になる・最後の一言で出してください。

--------------------------------------------
■ メール構成
--------------------------------------------

メール全体は、以下の流れにしてください。

1. 冒頭：今週のひとこと
2. 今週の流れ
3. 今週、気になった競合の動き
4. 今週、現場で使うならこの一言
5. 出典

検証済みニュースが1件しかない場合は、「今週の流れ」を省略してよいです。
検証済みニュースが0件の場合は、「今週、気になった競合の動き」にはニュースが少なかったことを短く書いてください。

--------------------------------------------
■ 各セクションの内容
--------------------------------------------

1. 冒頭：今週のひとこと

最初に、今週の競合の動きを表す短い問い・仮説・一言を書いてください。

ニュースの羅列はしないでください。
「今週の空気感」「なぜ見るべきか」「社内メンバーにとっての意味」を2〜4文で書いてください。

対象期間内の重要ニュースが少ない場合は、無理に盛り上げず、正直に書いてください。

2. 今週の流れ

ニュースを個別に並べる前に、今週採用したニュースに共通する流れを1〜2文で説明してください。
検証済みニュースが1件以下の場合は、このセクションは省略してよいです。

3. 今週、気になった競合の動き

競合の主要トピックを最大3件まで掲載してください。
このセクションには、Udemy Businessを競合として含めてはいけません。

各トピックは、以下の構成で短くまとめてください。

- ファクトベースの見出し
- 対象企業
- 区分
- 重要度
- 発表日時：YYYY-MM-DD HH:MM（UTC）
- LinkedIn関連ニュースの場合のみ：日本市場への影響
- 何が起きたか
- ここが気になる
- 出典URL

「何が起きたか」は事実のみを書いてください。

「ここが気になる」では、区分と重要度を踏まえながら、なぜ社内メンバーが気にした方がよいのかを短く書いてください。

1トピックあたりの分量は、180〜260字程度を目安にしてください。

4. 今週、現場で使うならこの一言

最初に、読者がそのまま商談・企画・社内会話で使える短いフレーズを1つ置いてください。

例：
- 「AI研修って、どの業務で成果を出すためにやりたいんでしたっけ？」
- 「その学習テーマ、忙しい人が最初の5分で入れる形になっていますか？」
- 「AIを学ぶ話ではなく、AIを使う業務を決める話から始めませんか？」
- 「このテーマ、受講して終わりではなく、現場でどう使うかまで話せていますか？」

その後、必要に応じて営業・マーケティング・商品開発・コンテンツ作成のうち、今週のニュースから実際に使えそうな示唆だけを書いてください。

全チームを必ず埋める必要はありません。
該当が薄いチームは書かないでください。
各チーム1行までにしてください。

検証済みニュースが0件の場合は、無理に示唆を作らないでください。
その場合は、「今週は大きな動きが少なかったため、商談や企画に直結する一言は控えめです」のように短く書いてください。

5. 出典

実際に本文で使ったURLのみを掲載してください。
サービス名ごとに簡潔に一覧化してください。
URLはクリック可能なaタグにしてください。

--------------------------------------------
■ 出力しないセクション
--------------------------------------------

以下のセクションは出力しないでください。

- 今週確認されたニュース
- 今週のニュースから言えること
- 大量のニュース一覧
- 大きな更新がなかった競合の一覧
- 長い調査メモ
- 網羅的なチーム別詳細
- 読者向けではない内部チェック項目
- SIGNATEに関するニュース
- Udemy Businessを競合として扱うセクション
- 自社側で拾えそうな話
- 小さくても拾っておきたい話
- Udemy Business担当者ならどう見るか
- インパクトの見方
- 来週、ちょっと見ておきたいこと
- 来週以降の注視ポイント
- 確度ラベル

--------------------------------------------
■ HTML出力ルール
--------------------------------------------

必ずHTMLのみで出力してください。
Markdownは使用しないでください。
コードブロックは使用しないでください。
html、head、bodyタグは不要です。
メール本文にそのまま埋め込めるHTML断片として出力してください。
「以下がレポートです」などの前置きは不要です。

HTMLデザインは以下を守ってください。

- 全体フォントは Arial, "Hiragino Sans", "Yu Gothic", sans-serif
- 文字色は #1f2937
- 背景色は #f3f4f6
- 本文コンテナは最大幅 760px
- セクションは白背景のカード形式
- 余白を十分に取る
- スマートフォンで読みやすくする
- テーブルは使わない
- URLはクリック可能なリンクにする
- 重要な判断は太字にする
- 1文を長くしすぎない
- 箇条書きを使いすぎない
- ラベルは必要最小限にする
- 主要ニュースごとのラベルは2〜3個以内を基本とする
- 「確度」ラベルは使わない
- 「日本影響」ラベルは、Udemy BusinessまたはLinkedIn関連ニュースの場合のみ使う

--------------------------------------------
■ HTMLスタイル指定
--------------------------------------------

全体ラッパー：

<div style="font-family: Arial, 'Hiragino Sans', 'Yu Gothic', sans-serif; background:#f3f4f6; padding:24px; color:#1f2937; line-height:1.7;">
  <div style="max-width:760px; margin:0 auto;">

ヘッダー：

<div style="background:#111827; color:#ffffff; padding:24px; border-radius:14px; margin-bottom:20px;">
  <h1 style="margin:0; font-size:22px; line-height:1.4;">Udemy Business 競合ニュース・インサイト Weekly</h1>
  <p style="margin:8px 0 0; font-size:14px; color:#d1d5db;">対象期間：${period}</p>
  <p style="margin:4px 0 0; font-size:13px; color:#9ca3af;">作成日時：${now}（UTC）</p>
</div>

カード：

<div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:14px; padding:20px; margin-bottom:16px;">
  <h2 style="font-size:18px; margin:0 0 12px; color:#111827;">セクション見出し</h2>
  <p style="margin:0 0 10px;">本文</p>
</div>

ラベル色：

区分ラベル：
- コンテンツの公開：background:#eef2ff; color:#3730a3;
- 新機能の追加：background:#ecfeff; color:#155e75;
- イベント、ニュース：background:#fef3c7; color:#92400e;
- パートナーシップ：background:#f0fdf4; color:#166534;
- その他：background:#f3f4f6; color:#374151;

重要度ラベル：
- 重要度：高：background:#fee2e2; color:#991b1b;
- 重要度：中：background:#ffedd5; color:#9a3412;
- 重要度：低：background:#e5e7eb; color:#374151;

日本市場への影響ラベル：
- 日本影響：高：background:#fee2e2; color:#991b1b;
- 日本影響：中：background:#ffedd5; color:#9a3412;
- 日本影響：低：background:#e5e7eb; color:#374151;
- 日本影響：不明：background:#dbeafe; color:#1e40af;

自社参考ラベル：
- 自社参考：background:#ede9fe; color:#5b21b6;

ラベルHTMLの基本形：

<span style="display:inline-block; padding:3px 8px; border-radius:999px; font-size:12px; font-weight:bold;">ラベル名</span>

--------------------------------------------
■ 最終チェック
--------------------------------------------

出力前に以下を確認してください。

- HTMLのみで出力している
- Markdownやコードブロックを使っていない
- 検証済みニュース以外の情報を追加していない
- 古いニュースで情報量を増やしていない
- 主要トピックは最大3件に絞っている
- 各主要トピックにニュース区分と重要度が付いている
- 区分は、テーマ名ではなく実際の発表内容に基づいている
- コンテンツ公開と新機能追加を同じ重みにしていない
- AI関連というだけで重要度を過度に高くしていない
- 各判断に短い根拠がある
- 事実と解釈が混ざっていない
- 根拠のない推測を書いていない
- 情報が少ない場合に無理な示唆を作っていない
- SIGNATEを掲載していない
- Udemy Businessを競合として扱っていない
- 日本市場への影響は、Udemy BusinessまたはLinkedIn関連の場合のみ出力している
- Schoo for Business、グロービス学び放題に対して日本影響ラベルを原則出力していない
- LinkedIn関連ニュースでは、LinkedIn全体 / LinkedIn Learning / LinkedIn Career Hub の違いが明記されている
- LinkedIn関連ニュースでは、Udemy Businessとの競争関係と日本市場への影響を分けて書いている
- 本文中で「競争インパクトは中程度です」「競争インパクトは低めです」「重要度は低めです」のような評価表っぽい表現を使っていない
- 「今週、現場で使うならこの一言」は、そのまま会話で使える短いフレーズになっている
- チーム別示唆は行動に近い内容だけに絞っている
- 出典URLがある情報だけを掲載している
- メールとして3分程度で概要を理解できる

############################################
最終結果のみHTMLで出力せよ
############################################
`;
}

async function main() {
  const nowDate = new Date();
  const now = nowDate.toISOString();

  const startDate = new Date(nowDate);
  startDate.setDate(startDate.getDate() - 7);

  const periodStartIso = startDate.toISOString();
  const periodEndIso = nowDate.toISOString();
  const period = `${formatDate(startDate)}〜${formatDate(nowDate)}`;

  const searchModel = process.env.REPORT_MODEL || "gpt-5.4-mini";
  const htmlModel = process.env.HTML_MODEL || process.env.REPORT_MODEL || "gpt-5.4-mini";

  console.log(`Search model: ${searchModel}`);
  console.log(`HTML model: ${htmlModel}`);
  console.log(`Report period: ${period}`);
  console.log(`Period start: ${periodStartIso}`);
  console.log(`Period end: ${periodEndIso}`);

  const candidatePrompt = buildCandidatePrompt({
    now,
    period,
    periodStartIso,
    periodEndIso,
  });

  const candidateResponse = await client.responses.create({
    model: searchModel,
    tools: [{ type: "web_search" }],
    input: candidatePrompt,
  });

  const candidateText = candidateResponse.output_text;

  console.log("Candidate raw output:");
  console.log(candidateText);

  const parsed = safeJsonParse(candidateText);
  const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];

  console.log("Parsed candidates:");
  console.log(JSON.stringify(rawCandidates, null, 2));

  const verifiedItems = validateAndFilterCandidates(
    rawCandidates,
    startDate,
    nowDate
  );

  console.log(`Raw candidates: ${rawCandidates.length}`);
  console.log(`Verified candidates: ${verifiedItems.length}`);
  console.log("Verified items:");
  console.log(JSON.stringify(verifiedItems, null, 2));

  if (rawCandidates.length > 0 && verifiedItems.length === 0) {
    console.warn(
      "Candidates were found, but all were rejected by validation. Check rejected candidate logs above."
    );
  }

  if (rawCandidates.length === 0) {
    console.warn(
      "No candidates were returned by the model. This may mean no news was found, or the search step failed to discover valid sources."
    );
  }

  const htmlPrompt = buildHtmlPrompt({
    now,
    period,
    verifiedItems,
  });

  const htmlResponse = await client.responses.create({
    model: htmlModel,
    input: htmlPrompt,
  });

  const report = htmlResponse.output_text;

  if (!report || !report.trim()) {
    throw new Error("HTML report is empty.");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_FROM,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject: `【Weekly】今週の競合ニュースと示唆（${period}）`,
    html: report,
    text: stripHtml(report),
  });

  console.log(`Weekly competitor news and insight report emailed successfully: ${period}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
