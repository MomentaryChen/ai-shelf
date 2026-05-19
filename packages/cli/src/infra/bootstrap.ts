import { openDatabase } from "../database/db.js";
import { WorkspaceRepository } from "../database/repositories/workspace-repository.js";
import { GroupRepository } from "../database/repositories/group-repository.js";
import { SessionRepository } from "../database/repositories/session-repository.js";
import { CommandHistoryRepository } from "../database/repositories/command-history-repository.js";
import { EventBus } from "../runtime/event-bus.js";
import { ProcessRegistry } from "../runtime/process-registry.js";
import { OutputBuffer } from "../runtime/output-buffer.js";
import { PtyRuntime } from "../runtime/pty-runtime.js";
import { SessionRuntime } from "../runtime/session-runtime.js";
import { WorkspaceRuntime } from "../runtime/workspace-runtime.js";
import { WorkspaceService } from "../services/workspace-service.js";
import { GroupService } from "../services/group-service.js";
import { SessionService } from "../services/session-service.js";
import { ExecService } from "../services/exec-service.js";
import { loadConfig } from "../config/loader.js";
import { createLogger, type Logger } from "../shared/logger.js";

export interface AppContext {
  config: ReturnType<typeof loadConfig>;
  logger: Logger;
  eventBus: EventBus;
  ptyRuntime: PtyRuntime;
  sessionRuntime: SessionRuntime;
  workspaceService: WorkspaceService;
  groupService: GroupService;
  sessionService: SessionService;
  execService: ExecService;
  close: () => void;
}

export function bootstrap(): AppContext {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const db = openDatabase();

  const workspaces = new WorkspaceRepository(db);
  const groups = new GroupRepository(db);
  const sessions = new SessionRepository(db);
  const commandHistory = new CommandHistoryRepository(db);

  const eventBus = new EventBus();
  const processRegistry = new ProcessRegistry();
  const outputBuffer = new OutputBuffer();
  const ptyRuntime = new PtyRuntime(outputBuffer);
  const sessionRuntime = new SessionRuntime(processRegistry, ptyRuntime, eventBus, sessions);
  const workspaceRuntime = new WorkspaceRuntime();

  const workspaceService = new WorkspaceService(workspaces, eventBus, workspaceRuntime);
  const groupService = new GroupService(workspaces, groups, eventBus);
  const sessionService = new SessionService(
    workspaces,
    groups,
    sessions,
    eventBus,
    sessionRuntime,
  );
  const execService = new ExecService(sessionService, sessionRuntime, commandHistory);

  eventBus.onAll((event) => {
    logger.debug({ event: event.type }, "domain event");
  });

  logger.info("ai-cli-inventory runtime initialized");

  return {
    config,
    logger,
    eventBus,
    ptyRuntime,
    sessionRuntime,
    workspaceService,
    groupService,
    sessionService,
    execService,
    close: () => db.close(),
  };
}
