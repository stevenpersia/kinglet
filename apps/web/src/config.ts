/** Everything that changes from one release to the next lives here. */
declare const __APP_VERSION__: string;

export const VERSION = __APP_VERSION__;
export const MCP_COMMAND = 'claude mcp add --scope user kinglet -- kinglet --mcp --ozone-platform=headless';

/** The source code, public on GitHub. */
export const REPO_URL = 'https://github.com/stevenpersia/kinglet';
/** Where everyone downloads the app: the latest GitHub release (AppImage, pacman). */
export const DOWNLOAD_URL = `${REPO_URL}/releases/latest`;
