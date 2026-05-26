import chalk from "chalk";

export function warnLegacyWorkspaceModel(alternative: string): void {
  console.warn(
    chalk.yellow(
      `Deprecation: workspace/group/session commands use a legacy model. ${alternative}`,
    ),
  );
}
