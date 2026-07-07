/**
 * Quote one argument for a `cmd.exe /c` command line.
 * Empty strings must be quoted as `""` or cmd drops them (e.g. `--tools ""`
 * becomes `--tools` and swallows the next flag), and cmd metacharacters
 * (& | < > ^ ( ) ; , = % !) must be quoted or cmd.exe interprets them.
 */
export function quoteCmdArg(arg: string): string {
  if (arg === "") return '""';
  if (!/[\s"&|<>^()%!;,=]/u.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}
