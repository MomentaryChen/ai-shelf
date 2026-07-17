import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Bump when script bodies change so cached files are rewritten. */
const VERSION = 4;

const BASH_SCRIPT = [
  "# AI Shelf shell integration — emit OSC 7 so the desktop can track cwd.",
  "# Used as bash --init-file; also safe to source.",
  'if [ -n "${__AISHELF_OSC7_LOADED:-}" ]; then',
  "  return 0 2>/dev/null || true",
  "fi",
  "__AISHELF_OSC7_LOADED=1",
  "",
  'if [ -z "${__AISHELF_BASHRC_DONE:-}" ]; then',
  "  __AISHELF_BASHRC_DONE=1",
  '  if [ -f "$HOME/.bashrc" ]; then',
  "    # shellcheck disable=SC1091",
  '    . "$HOME/.bashrc"',
  "  fi",
  "fi",
  "",
  "__aishelf_emit_osc7() {",
  "  # LC_ALL=C: index PWD as UTF-8 bytes so non-ASCII dirs percent-encode correctly.",
  "  local LC_ALL=C",
  '  local p out="" i=0 c hex',
  "  p=$PWD",
  "  local len=${#p}",
  "  while [ $i -lt $len ]; do",
  "    c=${p:i:1}",
  "    case $c in",
  "      [A-Za-z0-9/._~-]) out+=$c ;;",
  "      *)",
  "        printf -v hex '%%%02X' \"'$c\"",
  "        out+=$hex",
  "        ;;",
  "    esac",
  "    i=$((i + 1))",
  "  done",
  '  printf \'\\033]7;file://%s%s\\007\' "${HOSTNAME:-}" "$out"',
  "}",
  "",
  "if declare -p PROMPT_COMMAND 2>/dev/null | grep -q 'declare -a'; then",
  '  case " ${PROMPT_COMMAND[*]} " in',
  '    *" __aishelf_emit_osc7 "*) ;;',
  '    *) PROMPT_COMMAND=(__aishelf_emit_osc7 "${PROMPT_COMMAND[@]}") ;;',
  "  esac",
  "else",
  '  case ";${PROMPT_COMMAND:-};" in',
  "    *;__aishelf_emit_osc7;*|*;__aishelf_emit_osc7) ;;",
  '    *) PROMPT_COMMAND="__aishelf_emit_osc7${PROMPT_COMMAND:+;}${PROMPT_COMMAND:-}" ;;',
  "  esac",
  "fi",
  "",
  "__aishelf_emit_osc7",
  "",
].join("\n");

const PWSH_SCRIPT = [
  "# AI Shelf shell integration — emit OSC 7 so the desktop can track cwd.",
  "if (Get-Variable -Name __AIShelfOsc7Loaded -Scope Global -ErrorAction SilentlyContinue) {",
  "  return",
  "}",
  "$Global:__AIShelfOsc7Loaded = $true",
  "",
  "function Global:__AIShelf-Emit-Osc7 {",
  "  try {",
  "    $providerPath = $PWD.ProviderPath",
  "    if (-not $providerPath) { return }",
  "    $normalized = $providerPath.Replace('\\', '/')",
  "    $sb = New-Object System.Text.StringBuilder",
  "    foreach ($ch in $normalized.ToCharArray()) {",
  "      $code = [int][char]$ch",
  "      if (",
  "        ($code -ge 48 -and $code -le 57) -or",
  "        ($code -ge 65 -and $code -le 90) -or",
  "        ($code -ge 97 -and $code -le 122) -or",
  "        $ch -eq '/' -or $ch -eq ':' -or $ch -eq '-' -or $ch -eq '_' -or $ch -eq '.' -or $ch -eq '~'",
  "      ) {",
  "        [void]$sb.Append($ch)",
  "      } else {",
  "        foreach ($b in [System.Text.Encoding]::UTF8.GetBytes([string]$ch)) {",
  "          [void]$sb.AppendFormat('%{0:X2}', $b)",
  "        }",
  "      }",
  "    }",
  "    $pathEnc = $sb.ToString()",
  "    if ($pathEnc -match '^[A-Za-z]:') {",
  '      $uri = "file:///$pathEnc"',
  "    } else {",
  '      $uri = "file://$pathEnc"',
  "    }",
  "    $esc = [char]27",
  "    $bel = [char]7",
  '    [Console]::Write("$esc]7;$uri$bel")',
  "  } catch {",
  "    # never break the prompt",
  "  }",
  "}",
  "",
  "if (Test-Path Function:\\prompt) {",
  "  $Global:__AIShelfOriginalPrompt = $function:prompt",
  "}",
  "",
  "function Global:prompt {",
  "  __AIShelf-Emit-Osc7",
  "  if ($null -ne $Global:__AIShelfOriginalPrompt) {",
  "    return & $Global:__AIShelfOriginalPrompt",
  "  }",
  '  "PS $($executionContext.SessionState.Path.CurrentLocation)$(\'>\' * ($nestedPromptLevel + 1)) "',
  "}",
  "",
  "__AIShelf-Emit-Osc7",
  "",
].join("\n");

export interface ShellIntegrationPaths {
  bash: string;
  pwsh: string;
}

let cached: { baseDir: string; paths: ShellIntegrationPaths } | null = null;

/** Write versioned integration scripts under userData (cached per process). */
export function ensureShellIntegrationScripts(baseDir: string): ShellIntegrationPaths {
  if (cached?.baseDir === baseDir) return cached.paths;
  const dir = join(baseDir, "shell-integration");
  mkdirSync(dir, { recursive: true });
  const bash = join(dir, `osc7.v${VERSION}.sh`);
  const pwsh = join(dir, `osc7.v${VERSION}.ps1`);
  writeFileSync(bash, BASH_SCRIPT, "utf8");
  writeFileSync(pwsh, PWSH_SCRIPT, "utf8");
  cached = { baseDir, paths: { bash, pwsh } };
  return cached.paths;
}

export function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function bashSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
