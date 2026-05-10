const OpenAI = require("openai");
const nodemailer = require("nodemailer");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * =========================
 * 基本設定
 * =========================
 */

const TARGETS = [
  {
    id: "linkedin_learning",
    displayName: "LinkedIn Learning",
    searchName: "LinkedIn Learning",
    competitorType: "competitor",
    sourceHints: [
      "LinkedIn Learning official courses",
      "LinkedIn Learning official blog",
      "LinkedIn Learning AI courses",
      "LinkedIn Learning skills courses",
      "LinkedIn Learning business learning",
    ],
  },
  {
    id: "linkedin_career_hub",
    displayName: "LinkedIn Career Hub",
    searchName: "LinkedIn Career Hub",
    competitorType: "competitor",
    sourceHints: [
      "LinkedIn Career Hub official",
      "LinkedIn Career Hub skills",
      "LinkedIn Career Hub learning",
      "LinkedIn Career Hub workforce",
    ],
  },
  {
    id: "schoo",
    displayName: "Schoo",
    searchName: "Schoo for Business Schoo",
    competitorType: "competitor",
    sourceHints: [
      "Schoo official news",
      "Schoo for Business official",
      "schoo.jp/news",
      "Schoo 2026年5月 お知らせ",
      "Schoo 法人向け 学習",
    ],
  },
  {
    id: "globis",
    displayName: "グロービス学び放題",
    searchName: "グロービス学び放題 GLOBIS 学び放題 知見録",
    competitorType: "competitor",
    sourceHints: [
      "グロービス学び放題 公式",
      "GLOBIS学び放題 公式",
      "GLOBIS学び放題 知見録",
      "globis.jp/courses",
      "globis.jp 2026年5月 新着",
      "GLOBIS AI 2026年5月",
    ],
  },
  {
    id: "udemy_business",
    displayName: "Udemy Business",
    searchName: "Udemy Business",
    competitorType: "self_reference",
    sourceHints: [
      "Udemy Business official news",
      "Udemy Business blog",
      "Udemy Business product update",
    ],
  },
];

const EXCLUDED_COMPANIES = ["SIGNATE", "signate", "ＳＩＧＮＡＴＥ"];

const CATEGORY_LIST = [
  "コンテンツの公開",
  "新機能の追加",
  "イベント、ニュース",
  "パートナーシップ",
  "その他",
];

const IMPORTANCE_LIST = ["高", "中", "低"];

const EVIDENCE_RANK_LIST = ["A", "B", "C"];

/**
 * =========================
 * 汎用関数
 * =========================
 */

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeText(value) {
  return String(value || "").trim();
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

function getHostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isRootOrWeakUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");

    if (!path || path === "") {
      return true;
    }

    const weakPaths = [
      "/",
      "/ja",
      "/jp",
      "/news",
      "/courses",
      "/learning",
    ];

    return weakPaths.includes(path);
  } catch {
    return true;
  }
}

function isWithinPeriod(publishedAtUtc, startDate, endDate) {
  const publishedAt = new Date(publishedAtUtc);

  if (Number.isNaN(publishedAt.getTime())) {
    return false;
  }

  return publishedAt >= startDate && publishedAt <= endDate;
}

function normalizeCategory(category) {
  const value = normalizeText(category);
  return CATEGORY_LIST.includes(value) ? value : "その他";
}

function normalizeImportance(importance) {
  const value = normalizeText(importance);
  return IMPORTANCE_LIST.includes(value) ? value : "低";
}

function normalizeEvidenceRank(rank) {
  const value = normalizeText(rank).toUpperCase();
  return EVIDENCE_RANK_LIST.includes(value) ? value : "C";
}

function shouldExcludeCompany(value) {
  const text = normalizeText(value).toLowerCase();
  return EXCLUDED_COMPANIES.some((excluded) =>
    text.includes(excluded.toLowerCase())
  );
}

function importanceScore(value) {
  const normalized = normalizeImportance(value);

  if (normalized === "高") return 3;
  if (normalized === "中") return 2;
  return 1;
}

function evidenceScore(value) {
  const rank = normalizeEvidenceRank(value);

  if (rank === "A") return 3;
  if (rank === "B") return 2;
  return 1;
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const result = [];

  for (const item of candidates) {
    const key = `${normalizeText(item.title).toLowerCase()}::${normalizeText(
      item.primary_url
    ).toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function validateCandidate(item, target, startDate, endDate) {
  const rejectReasons = [];

  const title = normalizeText(item.title);
  const company = normalizeText(item.company || target.displayName);
  const primaryUrl = normalizeText(item.primary_url || item.url);
  const dateEvidenceUrl = normalizeText(item.date_evidence_url);
  const publishedAtUtc = normalizeText(item.published_at_utc);
  const evidenceRank = normalizeEvidenceRank(item.evidence_rank);

  if (!title) rejectReasons.push("missing title");
  if (!company) rejectReasons.push("missing company");
  if (!primaryUrl) rejectReasons.push("missing primary_url");
  if (!publishedAtUtc) rejectReasons.push("missing published_at_utc");

  if (primaryUrl && !isValidUrl(primaryUrl)) {
    rejectReasons.push("invalid primary_url");
  }

  if (dateEvidenceUrl && !isValidUrl(dateEvidenceUrl)) {
    rejectReasons.push("invalid date_evidence_url");
  }

  if (company && shouldExcludeCompany(company)) {
    rejectReasons.push("excluded company");
  }

  if (title && shouldExcludeCompany(title)) {
    rejectReasons.push("excluded company in title");
  }

  if (publishedAtUtc && !isWithinPeriod(publishedAtUtc, startDate, endDate)) {
    rejectReasons.push("outside period");
  }

  if (evidenceRank === "C") {
    rejectReasons.push("evidence rank C");
  }

  /**
   * トップページだけの出典は弱いので除外。
   * ただし、Bランクで date_evidence_url があり、
   * primary_url が個別ページなら採用可。
   */
  if (primaryUrl && isRootOrWeakUrl(primaryUrl)) {
    rejectReasons.push("weak primary_url");
  }

  return {
    isValid: rejectReasons.length === 0,
    rejectReasons,
  };
}

function normalizeCandidate(item, target) {
  const primaryUrl = normalizeText(item.primary_url || item.url);
  const dateEvidenceUrl = normalizeText(item.date_evidence_url);

  return {
    target_id: target.id,
    target_name: target.displayName,
    competitor_type: target.competitorType,
    title: normalizeText(item.title),
    company: normalizeText(item.company || target.displayName),
    service: normalizeText(item.service || target.displayName),
    category: normalizeCategory(item.category),
    importance: normalizeImportance(item.importance),
    published_at_utc: new Date(normalizeText(item.published_at_utc)).toISOString(),
    evidence_rank: normalizeEvidenceRank(item.evidence_rank),
    primary_url: primaryUrl,
    date_evidence_url: dateEvidenceUrl,
    date_evidence: normalizeText(item.date_evidence),
    content_evidence: normalizeText(item.content_evidence),
    source_type: normalizeText(item.source_type || "不明"),
    what_happened: normalizeText(item.what_happened),
    why_it_matters: normalizeText(item.why_it_matters),
    linkedin_scope: normalizeText(item.linkedin_scope),
    competition_with_udemy_business: normalizeText(
      item.competition_with_udemy_business
    ),
    japan_market_impact: normalizeText(item.japan_market_impact),
    japan_market_impact_reason: normalizeText(item.japan_market_impact_reason),
    source_host: getHostname(primaryUrl),
  };
}

/**
 * =========================
 * プロンプト生成
 * =========================
 */

function buildTargetCandidatePrompt({
  target,
  now,
  period,
  periodStartIso,
  periodEndIso,
}) {
  return `
############################################
競合別ニュース候補抽出エージェント
############################################

あなたは、Udemy Business向けの競合ニュースレポートに使える候補を抽出する調査エージェントです。

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
■ 今回調査する対象
--------------------------------------------
対象ID: ${target.id}
対象名: ${target.displayName}
検索名: ${target.searchName}
扱い: ${target.competitorType === "self_reference" ? "自社参考" : "競合"}

このステップでは、上記対象に関する情報だけを探してください。
他社のニュースを混ぜないでください。

--------------------------------------------
■ 探索ヒント
--------------------------------------------
以下の観点を使って、公式情報を中心に確認してください。

${target.sourceHints.map((hint) => `- ${hint}`).join("\n")}

併せて、以下の語を必要に応じて組み合わせてください。

- 2026年5月
- May 2026
- お知らせ
- ニュース
- 新機能
- 講座
- 授業
- コース
- AI
- リスキリング
- 法人向け
- スキル
- キャリア
- 企業研修
- 生成AI

--------------------------------------------
■ 候補抽出の考え方
--------------------------------------------

このステップでは、最終採用を厳しく判断しすぎないでください。
対象期間内の可能性がある候補を最大5件まで出してください。

ただし、以下は候補に含めないでください。

- 対象期間外であることが明らかな情報
- 検索結果の日付だけが新しい情報
- 古い記事の再掲
- SEO記事、まとめ記事
- 出典URLがない情報
- 推測、噂、未確認情報
- SIGNATEに関する情報
- 対象名が含まれるだけで、法人向け学習・人材育成・スキル・キャリア・企業研修との関係が薄い情報

--------------------------------------------
■ 根拠ランク
--------------------------------------------

各候補には evidence_rank を必ず付けてください。

【A】
個別ページ内に、タイトル・内容・発表日または公開日または更新日が確認できる。
この場合、primary_url には個別ページURLを入れてください。
date_evidence_url は primary_url と同じでよいです。

【B】
個別ページに内容はあるが、個別ページ内の日付が弱い。
ただし、公式の一覧ページ・トップページ・公式配信ページなどで、同一タイトルと対象期間内の日付が確認できる。
この場合、primary_url には個別ページURLを入れてください。
date_evidence_url には日付確認に使った公式ページURLを入れてください。

【C】
検索結果の日付のみ、トップページの断片のみ、SNS断片のみ、または推測でしか日付を確認できない。
この場合は候補として出してもよいですが、evidence_rank は C にしてください。

重要：
検索結果の日付だけを根拠にして A または B にしてはいけません。
トップページだけで内容の個別確認ができない場合は C にしてください。
対象期間外の情報を A または B にしてはいけません。

--------------------------------------------
■ ニュース区分
--------------------------------------------

category は、必ず以下のいずれかにしてください。

- コンテンツの公開
- 新機能の追加
- イベント、ニュース
- パートナーシップ
- その他

区分は、テーマ名ではなく「実際に何が発表・公開・更新されたのか」で判断してください。

例：
- AI活用の新講座公開 → コンテンツの公開
- 新しい授業公開 → コンテンツの公開
- AIレコメンド機能の追加 → 新機能の追加
- AI人材育成ウェビナー開催 → イベント、ニュース
- AI研修会社との協業発表 → パートナーシップ
- AI事業方針の発表 → その他

--------------------------------------------
■ 重要度
--------------------------------------------

importance は、必ず以下のいずれかにしてください。

- 高
- 中
- 低

判断基準：

【高】
- 新機能追加で、プロダクト比較や顧客体験に直接影響する
- パートナーシップで、販路・顧客基盤・提供価値・信頼性が広がる可能性がある
- 価格、プラン、導入支援、管理機能、スキル可視化、AI機能に関わる
- 営業提案、比較トーク、商品戦略、マーケティング戦略、コンテンツ戦略に影響する

【中】
- コンテンツ公開だが、法人顧客の関心が高いテーマである
- イベントやニュースだが、競合の訴求軸や市場の関心が見える
- 既存サービスの強化や導入事例の公開である
- AI、スキル可視化、キャリア支援、人材データ活用など中長期の競争軸に関係する

【低】
- 小規模なコンテンツ公開
- 軽微なキャンペーン
- 一般的なお知らせ
- 単発イベントの告知
- Udemy Businessとの競争関係が弱い
- 業務上の示唆が薄い

注意：
「AI」「リスキリング」「スキル可視化」など重要テーマを含んでいても、単なるコンテンツ公開であれば原則として高にしないでください。
一方で、コンテンツ公開であっても、競合のポジショニング変化や顧客ニーズの変化が明確に見える場合は中として扱ってよいです。

--------------------------------------------
■ LinkedIn関連ニュースの扱い
--------------------------------------------

対象がLinkedIn関連の場合は、以下を明確にしてください。

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

Schoo、Schoo for Business、グロービス学び放題、GLOBISに関するニュースでは、japan_market_impact は空文字にしてください。

日本市場への影響は以下のいずれかにしてください。

- 高
- 中
- 低
- 不明

日本向け提供、日本語対応、日本企業導入、日本市場向け発表が確認できない場合は断定しないでください。
その場合は「不明」を優先してください。

--------------------------------------------
■ 出力形式
--------------------------------------------

以下のJSON形式のみで出力してください。

{
  "target_id": "${target.id}",
  "target_name": "${target.displayName}",
  "candidates": [
    {
      "title": "ファクトベースの見出し",
      "company": "対象企業名",
      "service": "対象サービス名",
      "category": "コンテンツの公開 / 新機能の追加 / イベント、ニュース / パートナーシップ / その他",
      "importance": "高 / 中 / 低",
      "published_at_utc": "YYYY-MM-DDTHH:mm:ss.sssZ",
      "evidence_rank": "A / B / C",
      "primary_url": "個別ページURL。トップページだけを入れない",
      "date_evidence_url": "日付確認に使ったURL。Aの場合はprimary_urlと同じでよい",
      "date_evidence": "日付判断の根拠。例：個別ページに2026年5月8日公開と記載 / 公式一覧ページで同タイトルが2026年5月8日公開として掲載",
      "content_evidence": "内容確認の根拠。例：個別ページでAIツール活用を扱う音声コンテンツと確認",
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
  "target_id": "${target.id}",
  "target_name": "${target.displayName}",
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

Bランクのニュースの場合は、個別ページURLと日付確認URLの両方を掲載してよいです。
ただし、同じURLを重複して掲載しないでください。

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

/**
 * =========================
 * 候補抽出・検証
 * =========================
 */

async function extractCandidatesForTarget({
  target,
  now,
  period,
  periodStartIso,
  periodEndIso,
  model,
}) {
  const prompt = buildTargetCandidatePrompt({
    target,
    now,
    period,
    periodStartIso,
    periodEndIso,
  });

  console.log(`\n==============================`);
  console.log(`Extracting candidates for: ${target.displayName}`);
  console.log(`==============================`);

  const response = await client.responses.create({
    model,
    tools: [{ type: "web_search" }],
    input: prompt,
  });

  const rawText = response.output_text;

  console.log(`Raw output for ${target.displayName}:`);
  console.log(rawText);

  const parsed = safeJsonParse(rawText);
  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];

  console.log(`Parsed candidates for ${target.displayName}: ${candidates.length}`);
  console.log(JSON.stringify(candidates, null, 2));

  return candidates;
}

function validateAndNormalizeAllCandidates({
  candidatesByTarget,
  startDate,
  endDate,
}) {
  const accepted = [];
  const rejected = [];

  for (const { target, candidates } of candidatesByTarget) {
    for (const candidate of candidates) {
      const validation = validateCandidate(candidate, target, startDate, endDate);

      if (!validation.isValid) {
        const rejectedItem = {
          target: target.displayName,
          title: normalizeText(candidate.title),
          company: normalizeText(candidate.company),
          primary_url: normalizeText(candidate.primary_url || candidate.url),
          date_evidence_url: normalizeText(candidate.date_evidence_url),
          published_at_utc: normalizeText(candidate.published_at_utc),
          evidence_rank: normalizeText(candidate.evidence_rank),
          reject_reasons: validation.rejectReasons,
        };

        rejected.push(rejectedItem);
        console.warn("Rejected candidate:");
        console.warn(JSON.stringify(rejectedItem, null, 2));
        continue;
      }

      accepted.push(normalizeCandidate(candidate, target));
    }
  }

  const deduped = dedupeCandidates(accepted);

  const sorted = deduped.sort((a, b) => {
    const evidenceDiff = evidenceScore(b.evidence_rank) - evidenceScore(a.evidence_rank);
    if (evidenceDiff !== 0) return evidenceDiff;

    const importanceDiff = importanceScore(b.importance) - importanceScore(a.importance);
    if (importanceDiff !== 0) return importanceDiff;

    return new Date(b.published_at_utc) - new Date(a.published_at_utc);
  });

  return {
    accepted: sorted,
    rejected,
  };
}

function selectFinalItems(candidates, maxItems = 3) {
  /**
   * 自社参考は、競合ニュースが少ない場合のみ候補に残す。
   * 通常は競合ニュースを優先する。
   */
  const competitorItems = candidates.filter(
    (item) => item.competitor_type === "competitor"
  );

  const selfReferenceItems = candidates.filter(
    (item) => item.competitor_type === "self_reference"
  );

  if (competitorItems.length >= maxItems) {
    return competitorItems.slice(0, maxItems);
  }

  return [...competitorItems, ...selfReferenceItems].slice(0, maxItems);
}

/**
 * =========================
 * メイン処理
 * =========================
 */

async function main() {
  const nowDate = new Date();
  const now = nowDate.toISOString();

  const startDate = new Date(nowDate);
  startDate.setDate(startDate.getDate() - 7);

  const periodStartIso = startDate.toISOString();
  const periodEndIso = nowDate.toISOString();
  const period = `${formatDate(startDate)}〜${formatDate(nowDate)}`;

  const searchModel =
    process.env.SEARCH_MODEL ||
    process.env.REPORT_MODEL ||
    "gpt-5.4-mini";

  const htmlModel =
    process.env.HTML_MODEL ||
    process.env.REPORT_MODEL ||
    "gpt-5.4-mini";

  console.log("Weekly competitor report started.");
  console.log(`Search model: ${searchModel}`);
  console.log(`HTML model: ${htmlModel}`);
  console.log(`Report period: ${period}`);
  console.log(`Period start: ${periodStartIso}`);
  console.log(`Period end: ${periodEndIso}`);

  const candidatesByTarget = [];

  for (const target of TARGETS) {
    try {
      const candidates = await extractCandidatesForTarget({
        target,
        now,
        period,
        periodStartIso,
        periodEndIso,
        model: searchModel,
      });

      candidatesByTarget.push({
        target,
        candidates,
      });
    } catch (error) {
      console.error(`Failed to extract candidates for ${target.displayName}`);
      console.error(error);

      candidatesByTarget.push({
        target,
        candidates: [],
      });
    }
  }

  const rawCandidateCount = candidatesByTarget.reduce(
    (sum, item) => sum + item.candidates.length,
    0
  );

  const { accepted, rejected } = validateAndNormalizeAllCandidates({
    candidatesByTarget,
    startDate,
    endDate: nowDate,
  });

  const verifiedItems = selectFinalItems(accepted, 3);

  console.log("\n==============================");
  console.log("Candidate summary");
  console.log("==============================");
  console.log(`Raw candidates: ${rawCandidateCount}`);
  console.log(`Accepted candidates: ${accepted.length}`);
  console.log(`Rejected candidates: ${rejected.length}`);
  console.log(`Final selected items: ${verifiedItems.length}`);

  console.log("\nAccepted candidates:");
  console.log(JSON.stringify(accepted, null, 2));

  console.log("\nRejected candidates:");
  console.log(JSON.stringify(rejected, null, 2));

  console.log("\nFinal selected items:");
  console.log(JSON.stringify(verifiedItems, null, 2));

  if (rawCandidateCount > 0 && accepted.length === 0) {
    console.warn(
      "Candidates were found, but all were rejected. Check rejected candidate logs."
    );
  }

  if (rawCandidateCount === 0) {
    console.warn(
      "No candidates were returned by any target search. This may mean no news was found, or the search step failed to discover valid sources."
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

  console.log(
    `Weekly competitor news and insight report emailed successfully: ${period}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
