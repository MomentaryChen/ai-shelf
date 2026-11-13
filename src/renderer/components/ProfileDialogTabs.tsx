import { useLocale } from "../i18n/LocaleProvider";

export type ProfileDialogTab = "general" | "remote";

interface Props {
  value: ProfileDialogTab;
  onChange: (tab: ProfileDialogTab) => void;
  /** Show a dot on the Remote tab when SSH is enabled, so it is visible from General. */
  remoteEnabled: boolean;
  /** Highlight the Remote tab when its fields are invalid. */
  remoteInvalid?: boolean;
}

const TABS: { id: ProfileDialogTab; labelKey: "profile.tab.general" | "profile.tab.remote" }[] = [
  { id: "general", labelKey: "profile.tab.general" },
  { id: "remote", labelKey: "profile.tab.remote" },
];

/** General / Remote (SSH) switcher shared by the create and settings dialogs. */
export function ProfileDialogTabs({ value, onChange, remoteEnabled, remoteInvalid = false }: Props) {
  const { t } = useLocale();
  return (
    <div
      role="tablist"
      aria-label={t("profile.tab.label")}
      className="mb-4 flex gap-1 border-b border-chrome-border-subtle"
    >
      {TABS.map((tab) => {
        const selected = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`profile-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`profile-tabpanel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const next = tab.id === "general" ? "remote" : "general";
              onChange(next);
              document.getElementById(`profile-tab-${next}`)?.focus();
            }}
            tabIndex={selected ? 0 : -1}
            className={`-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-1.5 text-[12px] transition-colors ${
              selected
                ? "border-accent text-chrome-text"
                : "border-transparent text-chrome-text-subtle hover:text-chrome-text-secondary"
            }`}
          >
            {t(tab.labelKey)}
            {tab.id === "remote" && (remoteEnabled || remoteInvalid) ? (
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${remoteInvalid ? "bg-fail" : "bg-accent"}`}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
