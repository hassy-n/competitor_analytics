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
    searchName: "LinkedIn Learning 日本語 Japanese",
    competitorType: "competitor",
    searchScope:
      "LinkedIn Learning公式コース、公式コース一覧、LinkedIn Learningの日本語対応コース、日本語字幕・日本語音声・日本語ページが確認できるAI・スキル・法人学習に関係する更新",
    adoptionScope:
      "法人向け学習、企業研修、AI人材育成、スキル可視化、キャリア支援、リスキリングに示唆があり、かつ日本語対応が確認できるもの",
    preferredUrlPatterns: [
      "linkedin.com/learning/",
      "linkedin.com/business/learning/",
      "ad.linkedin.com/learning/",
    ],
    sourceHints: [
      "LinkedIn Learning 日本語 AI コース",
      "LinkedIn Learning Japanese AI courses",
      "LinkedIn Learning 日本語字幕 AI",
      "LinkedIn Learning 日本語音声 AI",
      "LinkedIn Learning 日本語 ビジネススキル",
      "LinkedIn Learning Japanese business skills",
      "site:linkedin.com/learning 日本語 LinkedIn Learning AI",
      "site:linkedin.com/learning Japanese LinkedIn Learning AI",
    ],
    requiresJapaneseAvailability: true,
  },
  {
    id: "linkedin_career_hub",
    displayName: "LinkedIn Career Hub",
    searchName: "LinkedIn Career Hub",
    competitorType: "competitor",
    searchScope:
      "LinkedIn Career Hub公式情報、LinkedIn公式ブログ、スキル、キャリア支援、人材育成に関係するLinkedIn公式発表",
    adoptionScope:
      "法人向け学習、キャリア支援、スキル可視化、人材育成、従業員のキャリア開発に示唆があるもの",
    preferredUrlPatterns: [
      "linkedin.com/business/",
      "linkedin.com/pulse/",
      "linkedin.com/blog/",
    ],
    sourceHints: [
      "LinkedIn Career Hub official",
      "LinkedIn Career Hub skills",
      "LinkedIn Career Hub learning",
      "LinkedIn Career Hub workforce",
    ],
    requiresJapaneseAvailability: false,
  },
  {
    id: "schoo",
    displayName: "Schoo",
    searchName: "Schoo Schoo for Business スクー",
    competitorType: "competitor",
    searchScope:
      "Schoo公式全体、Schoo公式ニュース、Schoo公式お知らせ、Schoo特集、無料公開授業、Schoo for Business関連ページ",
    adoptionScope:
      "法人向け学習、企業研修、スキル習得、思考整理、マネジメント、DX、AI、人材育成、学習継続、セルフマネジメントに示唆があるもの",
    preferredUrlPatterns: [
      "schoo.jp/news/",
      "schoo.jp/classes/",
      "schoo.jp/course/",
      "schoo.jp/feature/",
      "schoo.jp/biz/",
    ],
    sourceHints: [
      "Schoo official news",
      "Schoo お知らせ 2026年5月",
      "Schoo 無料公開授業 2026年5月",
      "Schoo 特集 2026年5月",
      "Schoo for Business official",
      "site:schoo.jp/news Schoo 2026年5月",
    ],
    requiresJapaneseAvailability: false,
  },
  {
    id: "globis",
    displayName: "グロービス学び放題",
    searchName: "グロービス学び放題 GLOBIS 学び放題 知見録",
    competitorType: "competitor",
    searchScope:
      "GLOBIS公式全体、グロービス学び放題、GLOBIS学び放題×知見録、GLOBIS知見録、コースページ、新着コンテンツ、音声コンテンツ、AIワークシフト",
    adoptionScope:
      "法人向け学習、ビジネススキル、AI、DX、人材育成、リスキリング、マネジメント、コンテンツ設計に示唆があるもの",
    preferredUrlPatterns: [
      "globis.jp/courses/",
      "globis.jp/article/",
      "globis.jp/feature/",
      "globis.jp/learn-content/",
      "globis.jp/explore-content/",
    ],
    sourceHints: [
      "グロービス学び放題 公式",
      "GLOBIS学び放題 公式",
      "GLOBIS学び放題 知見録",
      "globis.jp/courses",
      "globis.jp 2026年5月 新着",
      "GLOBIS AI 2026年5月",
      "site:globis.jp/courses 2026年5月 AI",
    ],
    requiresJapaneseAvailability: false,
  },
  {
    id: "udemy_business",
    displayName: "Udemy Business",
    searchName: "Udemy Business",
    competitorType: "self_reference",
    searchScope:
      "Udemy Business公式ニュース、公式ブログ、プロダクトアップデート、法人向け学習に関係する公式情報",
    adoptionScope:
      "自社参考として、競合ニュースの理解に必要なものだけ",
    preferredUrlPatterns: [
      "business.udemy.com/",
      "udemy.com/blog/",
      "research.udemy.com/",
    ],
    sourceHints: [
      "Udemy Business official news",
      "Udemy Business blog",
      "Udemy Business product update",
    ],
    requiresJapaneseAvailability: false,
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

const VALID_JAPANESE_AVAILABILITY = [
  "日本語対応あり",
  "日本語字幕あり",
  "日本語音声あり",
  "日本語ページあり",
];

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

function matchesPreferredUrlPattern(url, target) {
  const normalizedUrl = normalizeText(url).toLowerCase();

  return target.preferredUrlPatterns.some((pattern) =>
    normalizedUrl.includes(pattern.toLowerCase())
  );
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

function normalizeJapaneseAvailability(value, target) {
  const normalized = normalizeText(value);

  if (!target.requiresJapaneseAvailability) {
    return normalized || "不要";
  }

  return normalized || "未確認";
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

  const japaneseAvailability = normalizeJapaneseAvailability(
    item.japanese_availability,
    target
  );

  const japaneseAvailabilityEvidence = normalizeText(
    item.japanese_availability_evidence
  );

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

  if (primaryUrl && isRootOrWeakUrl(primaryUrl)) {
    rejectReasons.push("weak primary_url");
  }

  /**
   * LinkedIn Learning専用：
   * 日本語対応が確認できるコンテンツだけを採用する。
   */
  if (target.requiresJapaneseAvailability) {
    if (!VALID_JAPANESE_AVAILABILITY.includes(japaneseAvailability)) {
      rejectReasons.push("missing Japanese availability");
    }

    if (!japaneseAvailabilityEvidence) {
      rejectReasons.push("missing Japanese availability evidence");
    }
  }

  return {
    isValid: rejectReasons.length === 0,
    rejectReasons,
  };
}

function normalizeCandidate(item, target) {
  const primaryUrl = normalizeText(item.primary_url || item.url);
  const dateEvidenceUrl = normalizeText(item.date_evidence_url);
  const preferredUrlMatched = matchesPreferredUrlPattern(primaryUrl, target);

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
    japanese_availability: normalizeJapaneseAvailability(
      item.japanese_availability,
      target
    ),
    japanese_availability_evidence: normalizeText(
      item.japanese_availability_evidence
    ),
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
    preferred_url_matched: preferredUrlMatched,
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
■ 探索範囲
--------------------------------------------
以下の範囲を広く探索してください。

${target.searchScope}

重要：
探索範囲は広く取ってください。
${target.displayName}専用ページだけに限定しないでください。
公式ニュース、公式お知らせ、公式コースページ、公式特集、公式配信ページ、公式一覧ページに対象期間内の更新があるか確認してください。

--------------------------------------------
■ 採用範囲
--------------------------------------------
候補として残すのは、以下に示唆があるものです。

${target.adoptionScope}

重要：
探索は広く、採用は上記の業務示唆で絞ってください。
Schooの場合はSchoo for Business専用ニュースでなくても、法人向け学習・企業研修・スキル習得・思考整理・マネジメント・DX・AI・人材育成に示唆があれば候補に含めてください。
GLOBISの場合も、グロービス学び放題専用ニュースでなくても、GLOBIS公式のコース・知見録・新着コンテンツで法人向け学習に示唆があれば候補に含めてください。

${
  target.requiresJapaneseAvailability
    ? `
--------------------------------------------
■ LinkedIn Learningの日本語対応条件
--------------------------------------------

この対象は LinkedIn Learning です。

LinkedIn Learningのコースやコンテンツを候補にする場合は、日本語対応が確認できるものだけを候補にしてください。

採用できる条件：
- 日本語字幕が確認できる
- 日本語音声が確認できる
- 日本語ページとして確認できる
- 日本語対応、Japanese、Japanese subtitles などの記載が確認できる
- 日本語で受講可能と判断できる公式情報がある

採用してはいけない条件：
- 英語のみのコース
- 日本語対応が確認できないコース
- グローバルの英語コース一覧に掲載されているだけのコース
- 日本語対応の根拠が検索結果や推測だけのコース

候補に含める場合は、japanese_availability と japanese_availability_evidence を必ず記入してください。

japanese_availability は以下のいずれかにしてください。

- 日本語対応あり
- 日本語字幕あり
- 日本語音声あり
- 日本語ページあり
- 未確認

日本語対応が確認できない場合は、どれほどAI・スキル・法人学習に関係していても候補から除外してください。
候補として出す場合でも、日本語対応が未確認なら japanese_availability は「未確認」にしてください。
`
    : ""
}

--------------------------------------------
■ 優先URLパターン
--------------------------------------------
可能な限り、以下に合う個別ページURLを primary_url に使ってください。

${target.preferredUrlPatterns.map((pattern) => `- ${pattern}`).join("\n")}

トップページだけ、一覧ページだけ、検索結果ページだけを primary_url にしないでください。
ただし、Bランクの場合は、date_evidence_url に公式一覧ページや公式トップページを入れてよいです。

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
- 特集
- 無料公開
- AI
- リスキリング
- 法人向け
- スキル
- キャリア
- 企業研修
- 生成AI
- マネジメント
- DX
- 日本語
- Japanese
- 日本語字幕
- Japanese subtitles

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
- LinkedIn Learningにおいて、日本語対応が確認できない英語のみのコース

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
      "japanese_availability": "日本語対応あり / 日本語字幕あり / 日本語音声あり / 日本語ページあり / 未確認 / 不要",
      "japanese_availability_evidence": "日本語対応を確認した根拠。LinkedIn Learning以外では空文字でよい",
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
■ 文章トーン
--------------------------------------------

少し口語体で、社内メールとして失礼にならないトーンにしてください。

避ける表現：
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

冒頭の見出しは、読者が読み進めたくなる問い・仮説・一言でよいです。

一方で、「今週、気になった競合の動き」に掲載する各ニュースの見出しは、必ずファクトベースにしてください。
見出しだけを読んでも、何が起きたかが分かるようにしてください。

--------------------------------------------
■ 各ニュースの構成
--------------------------------------------

各トピックは以下の構成で短くまとめてください。

- ファクトベースの見出し
- 対象企業
- 区分
- 重要度
- 発表日時：YYYY-MM-DD HH:MM（UTC）
- LinkedIn関連ニュースの場合のみ：日本市場への影響
- LinkedIn Learningのコンテンツの場合のみ：日本語対応状況
- 何が起きたか
- ここが気になる
- 出典URL

1トピックあたりの分量は、180〜260字程度を目安にしてください。

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

日本語対応ラベル：
- 日本語対応あり：background:#dcfce7; color:#166534;
- 日本語字幕あり：background:#dcfce7; color:#166534;
- 日本語音声あり：background:#dcfce7; color:#166534;
- 日本語ページあり：background:#dcfce7; color:#166534;

自社参考ラベル：
- 自社参考：background:#ede9fe; color:#5b21b6;

ラベルHTMLの基本形：

<span style="display:inline-block; padding:3px 8px; border-radius:999px; font-size:12px; font-weight:bold;">ラベル名</span>

--------------------------------------------
■ 最終チェック
--------------------------------------------

出力前に以下を確認してください。

- HTMLのみで出力している
- 検証済みニュース以外の情報を追加していない
- 古いニュースで情報量を増やしていない
- 主要トピックは最大3件に絞っている
- 各主要トピックにニュース区分と重要度が付いている
- LinkedIn Learningのコンテンツは、日本語対応が確認できるものだけを掲載している
- 事実と解釈が混ざっていない
- 根拠のない推測を書いていない
- 情報が少ない場合に無理な示唆を作っていない
- SIGNATEを掲載していない
- Udemy Businessを競合として扱っていない
- 出典URLがある情報だけを掲載している

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
          japanese_availability: normalizeText(candidate.japanese_availability),
          japanese_availability_evidence: normalizeText(
            candidate.japanese_availability_evidence
          ),
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
    const evidenceDiff =
      evidenceScore(b.evidence_rank) - evidenceScore(a.evidence_rank);
    if (evidenceDiff !== 0) return evidenceDiff;

    const importanceDiff =
      importanceScore(b.importance) - importanceScore(a.importance);
    if (importanceDiff !== 0) return importanceDiff;

    if (b.preferred_url_matched !== a.preferred_url_matched) {
      return b.preferred_url_matched ? 1 : -1;
    }

    return new Date(b.published_at_utc) - new Date(a.published_at_utc);
  });

  return {
    accepted: sorted,
    rejected,
  };
}

function selectFinalItems(candidates, maxItems = 3) {
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
