import { describe, expect, it } from "vitest";

import { classify, classifyWithMatch } from "./topics";

describe("classify", () => {
  it("assigns each topic from its own keywords", () => {
    expect(classify("Homa raises $100m Series B", "")).toBe("deals");
    expect(classify("Squad Busters is out now worldwide", "")).toBe("launch");
    expect(classify("Epic v Apple ruling lands", "")).toBe("policy");
    expect(classify("How to cut CPI on Android", "")).toBe("ua");
    expect(classify("Top grossing charts for August", "")).toBe("data");
    expect(classify("Zynga appointed a new studio head", "")).toBe("people");
  });

  it("falls back to other when nothing matches", () => {
    expect(classify("A quiet week in Helsinki", "Nothing much happened.")).toBe("other");
  });

  it("keeps data for genuine data keyword hits", () => {
    expect(classify("Top grossing charts for August", "")).toBe("data");
    expect(classify("Revenue forecast for 2027", "")).toBe("data");
  });

  it("takes the added deal and departure synonyms from the title", () => {
    // These previously reached the right bucket only via the excerpt.
    expect(classifyWithMatch("Supercell Buys Metacore", "").inTitle).toBe(true);
    expect(classify("Supercell Buys Metacore", "")).toBe("deals");
    expect(classify("Alibaba is divesting Lingxi Games", "")).toBe("deals");
    expect(classify("Supercell London GM Lasse Seppänen leaves to start his own studio", "")).toBe(
      "people",
    );
  });

  it("cannot assign other by keyword — it is reachable only as the fallback", () => {
    expect(classifyWithMatch("Supercell shutters Clash Mini", "").matched).toBe(false);
    expect(classifyWithMatch("Supercell shutters Clash Mini", "").topic).toBe("other");
  });

  it("applies rules in topic order, so the first hit wins", () => {
    // Matches both `raises` (deals) and `report` (data). Deals is listed first.
    expect(classify("Report: Dream Games raises new round", "Revenue also grew.")).toBe("deals");
  });

  it("reads the excerpt only when the title matched nothing", () => {
    expect(classify("A week in review", "The studio acquired a Helsinki team.")).toBe("deals");
  });

  it("lets a title hit outrank an excerpt hit from an earlier bucket", () => {
    // The excerpt mentions investment (deals, first); the title says the story
    // is about someone stepping down (people, second). The title wins.
    expect(
      classify(
        "Savvy Games Group CEO Brian Ward steps down",
        "The group has invested heavily in studios over the past year.",
      ),
    ).toBe("people");
  });

  it("puts people ahead of launch and policy", () => {
    // A furlough story that happens to mention a launch.
    expect(classify("Bit Reactor furloughed workers ahead of launch", "")).toBe("people");
    // A store executive departing is a people story, not a policy one.
    expect(classify("Eddy Cue to take over the App Store as Phil Schiller steps down", "")).toBe(
      "people",
    );
  });

  it("no longer sends every Apple or Google mention to policy", () => {
    // Bare company names were removed; these are data and opinion stories.
    expect(classify("Apple saw US App Store spending fall for the first time", "")).toBe("policy");
    expect(classify("Apple reported record quarterly revenue", "")).toBe("data");
    expect(classify("On the podcast: Clash Royale drama and Google's AI hypeman", "")).toBe(
      "opinion",
    );
    // Genuine store policy still lands in policy.
    expect(classify("New App Store rules take effect in January", "")).toBe("policy");
  });

  it("catches trade-show coverage without stealing stories that merely happen there", () => {
    expect(classify("Gamescom 2026 attendance rose 6% to 368,000 visitors", "")).toBe("events");
    expect(classify("Niko Partners observations at ChinaJoy 2026", "")).toBe("events");
    // A funding round announced at a show is still a deal.
    expect(classify("Entity raises €5m in seed funding, announced at Gamescom", "")).toBe("deals");
  });

  it("keeps opinion late enough not to swallow other buckets", () => {
    expect(classify("Why platform-led gaming in China is falling short", "")).toBe("opinion");
    expect(classify("GTA 6 will have a halo effect for the entire industry | Opinion", "")).toBe(
      "opinion",
    );
    // "How to" must not outrank UA.
    expect(classify("How to cut CPI on Android", "")).toBe("ua");
    // ...nor data.
    expect(classify("Why revenue fell in July", "")).toBe("data");
  });

  it("is case insensitive", () => {
    expect(classify("SERIES A FOR A NEW STUDIO", "")).toBe("deals");
    expect(classify("series a for a new studio", "")).toBe("deals");
  });

  it("matches ordinary inflections of a stem", () => {
    for (const title of ["Miniclip acquires", "Miniclip acquired", "Miniclip acquiring"]) {
      expect(classify(title, "")).toBe("deals");
    }
  });

  it("does not fire short acronyms inside longer words", () => {
    // "ua" inside "actual", "att" inside "attached" — neither is a UA story.
    expect(classify("The actual numbers behind it", "Nothing attached here.")).toBe("other");
    // Guard against `ipo` matching inside a word.
    expect(classify("A tripod for mobile capture", "")).toBe("other");
  });

  it("does not fire on words that merely contain a keyword", () => {
    // Each of these would be a false positive under substring matching:
    // ua/usual, ua/Ukraine, stake/mistake, beta/betamax, ipo/tripod.
    const cases = [
      "Business as usual for the studio",
      "A studio opens in Ukraine",
      "The mistake that cost them a year",
      "A betamax of a game design",
      "Shipping a tripod accessory",
      "Applecart upset in Cupertino",
      "Googling for answers",
    ];

    for (const title of cases) {
      expect(classify(title, "")).toBe("other");
    }
  });

  it("still matches those acronyms as standalone tokens", () => {
    expect(classify("UA benchmarks for Q3", "")).toBe("ua");
    expect(classify("What ATT did to targeting", "")).toBe("ua");
  });

  it("classifies Turkish headlines", () => {
    expect(classify("Oyun Sektörü Etkinlikleri | 31 Ağustos - 6 Eylül 2026", "")).toBe("events");
    expect(classify("Surge Games'e 3 milyon dolar yatırım", "")).toBe("deals");
    expect(classify("Loom Games ödülleri topladı", "")).toBe("events");
    expect(classify("Stüdyo 40 kişiyi işten çıkardı", "")).toBe("people");
    expect(classify("Yeni oyunun lansmanı ertelendi", "")).toBe("launch");
    expect(classify("Mahkeme kararı sektörü etkiledi", "")).toBe("policy");
  });

  it("matches Turkish words that begin with a non-ASCII letter", () => {
    // \b is defined against [A-Za-z0-9_], so there is NO word boundary between
    // a space and "ö". A \b-anchored pattern would silently never match these.
    expect(classify("Loom Games ödül kazandı", "")).toBe("events");
    expect(classify("Şirket ön kayıt açtı", "")).toBe("launch");
  });

  it("matches Turkish words written with a dotted capital İ", () => {
    // "İ".toLowerCase() is "i" + U+0307, which would not equal a plain "i".
    expect(classify("İstifa etti", "")).toBe("people");
    expect(classify("İşten çıkarmalar sürüyor", "")).toBe("people");
  });

  it("pins Turkish prefixes that would otherwise over-match", () => {
    // "pazar" (market) must not fire on "Pazartesi" (Monday).
    expect(classify("Pazartesi günü açıklama yapıldı", "")).toBe("other");
    expect(classify("Mobil oyun pazarı büyüdü", "")).toBe("data");
  });

  it("distinguishes a summit from a chart peak", () => {
    // Turkish names a summit with the possessive; the "top of the charts"
    // sense stays bare. Only the possessive should reach events.
    expect(classify("Mobil Oyun Zirvesi başlıyor", "")).toBe("events");
    expect(classify("Türkiye Oyun Zirvesi'nde konuşuldu", "")).toBe("events");
    expect(classify("Listelerde zirve Türk yapımı oyunun", "")).not.toBe("events");
    expect(classify("Yeni oyun zirveye çıktı", "")).not.toBe("events");
  });

  it("accepts both British and American spellings where they differ", () => {
    expect(classify("Monetisation trends", "")).toBe("ua");
    expect(classify("Monetization trends", "")).toBe("ua");
    expect(classify("A new licence regime", "")).toBe("policy");
    expect(classify("A new license regime", "")).toBe("policy");
  });
});
