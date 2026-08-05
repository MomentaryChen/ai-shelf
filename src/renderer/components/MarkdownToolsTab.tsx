import { useId, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "../i18n/LocaleProvider";
import { Card } from "./Card";
import { FlowMarkdownContent } from "./FlowMarkdownContent";
import { SectionHeading } from "./SectionHeading";

const SAMPLE_MARKDOWN = `# Markdown preview

Supports **GFM** tables, lists, and \`code\`.

| Step | Status |
| --- | --- |
| Edit | Ready |
| Preview | Live |

## Flowchart

\`\`\`mermaid
flowchart TD
  A[Paste Markdown] --> B{Has Mermaid?}
  B -->|Yes| C[Render diagram]
  B -->|No| D[Show GFM preview]
  C --> E[Done]
  D --> E
\`\`\`
`;

const fieldClass =
  "h-[min(60vh,520px)] min-h-[320px] resize-y overflow-auto border-border bg-bg-primary font-mono text-[13px] leading-relaxed text-text-primary placeholder:text-text-tertiary [field-sizing:fixed]";

const previewClass =
  "h-[min(60vh,520px)] min-h-[320px] overflow-auto rounded-[22px] border border-border bg-bg-primary px-4 py-3";

export function MarkdownToolsTab() {
  const { t } = useLocale();
  const inputId = useId();
  const [input, setInput] = useState(SAMPLE_MARKDOWN);

  return (
    <>
      <SectionHeading icon={FileText}>{t("tools.tab.markdown")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("markdown.subtitle")}
      </p>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="grid items-start gap-3 @md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex h-8 min-w-0 items-center justify-between gap-2">
                <Label htmlFor={inputId} className="text-[12px] font-medium text-text-secondary">
                  {t("markdown.input")}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setInput(SAMPLE_MARKDOWN)}
                  className="h-8 px-2 text-[12px]"
                >
                  {t("markdown.sample")}
                </Button>
              </div>
              <Textarea
                id={inputId}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
                placeholder={t("markdown.inputPlaceholder")}
                className={fieldClass}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex h-8 min-w-0 items-center">
                <Label className="text-[12px] font-medium text-text-secondary">
                  {t("markdown.preview")}
                </Label>
              </div>
              <div className={previewClass}>
                {input.trim() ? (
                  <FlowMarkdownContent content={input} />
                ) : (
                  <p className="text-[13px] text-text-tertiary">{t("markdown.empty")}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setInput("")}
              disabled={!input}
            >
              {t("markdown.clear")}
            </Button>
            <span className="text-[12px] text-text-tertiary">{t("markdown.hint.live")}</span>
          </div>
        </div>
      </Card>
    </>
  );
}
