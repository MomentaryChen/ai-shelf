import { Plus, Trash2 } from "lucide-react";
import type { SavedCommandSnippet } from "../types";
import { useLocale } from "../i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  value: SavedCommandSnippet[];
  onChange: (next: SavedCommandSnippet[]) => void;
  disabled?: boolean;
}

function newSnippet(): SavedCommandSnippet {
  return {
    id: crypto.randomUUID(),
    name: "",
    command: "",
    broadcast: false,
  };
}

export function SavedCommandsEditor({ value, onChange, disabled = false }: Props) {
  const { t } = useLocale();

  function updateAt(index: number, patch: Partial<SavedCommandSnippet>) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <fieldset className="mb-4 rounded-lg border border-chrome-border-subtle bg-chrome-surface/40 p-3">
      <legend className="mb-2 block text-[11px] text-chrome-text-subtle">
        {t("profile.savedCommands.legend")}
      </legend>
      <p className="mb-2 text-[10px] font-normal text-chrome-text-dim">
        {t("profile.savedCommands.hint")}
      </p>
      <div className="flex flex-col gap-2">
        {value.length === 0 && (
          <p className="rounded-md px-2 py-1.5 text-[11px] text-chrome-text-muted">
            {t("profile.savedCommands.empty")}
          </p>
        )}
        {value.map((snippet, index) => (
          <div
            key={snippet.id}
            className="rounded-md border border-chrome-border-subtle bg-chrome-bg/60 p-2"
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <Input
                value={snippet.name}
                onChange={(e) => updateAt(index, { name: e.target.value })}
                placeholder={t("profile.savedCommands.namePlaceholder")}
                disabled={disabled}
                className="min-w-0 flex-1 border-chrome-border-subtle bg-chrome-bg text-[12px] text-chrome-text placeholder:text-chrome-text-dim focus-visible:border-chrome-border-hover"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                onClick={() => removeAt(index)}
                className="h-7 w-7 shrink-0 text-chrome-text-muted hover:text-destructive"
                title={t("profile.savedCommands.remove")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Input
              value={snippet.command}
              onChange={(e) => updateAt(index, { command: e.target.value })}
              placeholder={t("profile.savedCommands.commandPlaceholder")}
              disabled={disabled}
              className="mb-1.5 border-chrome-border-subtle bg-chrome-bg font-mono text-[11px] text-chrome-text placeholder:text-chrome-text-dim focus-visible:border-chrome-border-hover"
            />
            <Label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-normal text-chrome-text-muted">
              <Checkbox
                checked={snippet.broadcast ?? false}
                onCheckedChange={(v) => updateAt(index, { broadcast: v === true })}
                disabled={disabled}
              />
              {t("profile.savedCommands.broadcast")}
            </Label>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || value.length >= 32}
          onClick={() => onChange([...value, newSnippet()])}
          className="h-7 gap-1 self-start border-chrome-border-subtle text-[11px] text-chrome-text-secondary"
        >
          <Plus className="h-3 w-3" />
          {t("profile.savedCommands.add")}
        </Button>
      </div>
    </fieldset>
  );
}
