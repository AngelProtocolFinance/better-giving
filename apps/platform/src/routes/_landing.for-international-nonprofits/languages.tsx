const langs = [
  "English",
  "Español",
  "Français",
  "العربية",
  "Português",
  "Deutsch",
  "Italiano",
  "Nederlands",
  "Polski",
  "Українська",
  "हिन्दी",
  "中文",
  "日本語",
  "한국어",
  "Kiswahili",
  "Tagalog",
  "Tiếng Việt",
  "Türkçe",
  "Bahasa",
] as const;

export function Languages({ classes = "" }) {
  return (
    <div className={classes}>
      <h2 className="article-heading">Donation forms in 19 languages</h2>
      <p className="text-base/relaxed text-muted-fg mt-3 text-pretty">
        Your donors give in the language they think in, including full
        right-to-left support for Arabic. Localized forms convert better, and
        yours are included at no extra cost.
      </p>
      <ul className="flex flex-wrap gap-1.5 mt-5">
        {langs.map((l) => (
          <li
            key={l}
            className="text-sm bg-card border border-border rounded-sm px-2.5 py-1"
          >
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}
