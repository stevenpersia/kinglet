import { app } from 'electron';

/** Arguments Claude Code passes to launch the MCP server (works without a display). */
export const MCP_ARGS = ['--mcp', '--ozone-platform=headless'];

/** How to launch `kinglet --mcp` from this installation. */
export function mcpLaunch(): { exe: string; args: string[] } {
  // AppImage: the binary lives in a temporary mount, the stable path is $APPIMAGE.
  const exe = process.env.APPIMAGE ?? process.execPath;
  return { exe, args: [...(app.isPackaged ? [] : [app.getAppPath()]), ...MCP_ARGS] };
}
