import { Fade } from "@animate-ui/react/primitives/effects/fade";

const MODEL_PAGE = "https://huggingface.co/mehdi-hf/chatterbox-farsi";

const NOTES = [
  {
    title: "حریم خصوصی کامل",
    body: "همه‌چیز روی همین دستگاه پردازش می‌شود. متن، صدا و فایل‌های شما به هیچ سروری فرستاده نمی‌شود.",
  },
  {
    title: "استفادهٔ مسئولانه",
    body: "فقط صدای خودتان یا کسی را شبیه‌سازی کنید که اجازه داده است. هر خروجی واترمارک نامرئی Perth دارد؛ گفتار مصنوعی را اعلام کنید.",
  },
  {
    title: "مجوز مدل",
    body: "Chatterbox Farsi با مجوز غیرتجاری منتشر شده است: برای پژوهش، آموزش و کار شخصی. استفادهٔ تجاری نیاز به مجوز جداگانه دارد.",
  },
];

export function Footer() {
  return (
    <footer className="mx-auto mt-14 max-w-6xl px-4 pb-10 sm:px-6">
      <Fade inView inViewOnce>
        <div className="bg-card grid gap-6 rounded-xl border border-border/70 p-6 sm:grid-cols-3">
          {NOTES.map((note) => (
            <div key={note.title}>
              <div className="text-sm font-bold">{note.title}</div>
              <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{note.body}</p>
            </div>
          ))}
        </div>
      </Fade>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <a
          href={MODEL_PAGE}
          target="_blank"
          rel="noreferrer"
          dir="ltr"
          className="font-medium underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Powered by OncillaAI Chatterbox Farsi
        </a>
        <span dir="ltr">Interface: Animate UI · Vazirmatn</span>
      </div>
    </footer>
  );
}
