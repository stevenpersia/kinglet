import { join } from 'node:path';
import { t } from '@kinglet/core';
import { linearError, type LinearTeam } from '../shared/feedback';
import type { LinearState } from '../shared/types';
import { secretFile } from './secret';

/** A data URL as bytes and its type. */
function decodeDataUrl(dataUrl: string): { type: string; bytes: Buffer } | null {
  const m = dataUrl.match(/^data:([\w/+.-]+);base64,(.*)$/s);
  return m ? { type: m[1]!, bytes: Buffer.from(m[2]!, 'base64') } : null;
}

/**
 * Linear connection (personal API key, encrypted like the GitHub token): sends the feedback of a
 * project as an issue in the team chosen for it, captures included.
 */
export class LinearService {
  private file: string;
  private key: string | null = null;
  state: LinearState = { connected: false, user: null, teams: [], error: null };

  constructor(
    userData: string,
    private emit: (s: LinearState) => void,
    private baseUrl = process.env.KINGLET_LINEAR_API ?? 'https://api.linear.app/graphql',
  ) {
    this.file = join(userData, 'linear.json');
  }

  private update(patch: Partial<LinearState>) {
    this.state = { ...this.state, ...patch };
    this.emit(this.state);
  }

  private async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    if (!this.key) throw new Error(t('Linear not connected', 'Linear non connecté'));
    let res: Response;
    try {
      // Personal API keys go as they are, without "Bearer".
      res = await fetch(this.baseUrl, { method: 'POST', headers: { authorization: this.key, 'content-type': 'application/json', 'user-agent': 'Kinglet' }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new Error(t(`Linear unreachable (${(e as Error).message}).`, `Linear injoignable (${(e as Error).message}).`));
    }
    const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: Parameters<typeof linearError>[1] };
    const error = linearError(res.status, body.errors);
    if (error) throw new Error(error);
    if (!body.data) throw new Error(`Linear: HTTP ${res.status}`);
    return body.data;
  }

  private async open() {
    const d = await this.gql<{ viewer: { name: string; email: string | null }; teams: { nodes: LinearTeam[] } }>('query { viewer { name email } teams(first: 100) { nodes { id key name } } }');
    this.update({ connected: true, user: { name: d.viewer.name, email: d.viewer.email ?? null }, teams: d.teams.nodes, error: null });
  }

  async restore() {
    try {
      this.key = secretFile.read(this.file);
      if (this.key) await this.open();
    } catch (e) {
      this.update({ error: t(`Couldn’t connect to Linear: ${(e as Error).message}`, `Connexion Linear impossible : ${(e as Error).message}`) });
    }
  }

  async connect(key: string) {
    this.key = key.trim();
    try {
      await this.open();
    } catch (e) {
      this.key = null;
      this.update({ connected: false, user: null, teams: [], error: (e as Error).message });
      return this.state;
    }
    secretFile.write(this.file, this.key);
    return this.state;
  }

  async refresh() {
    try {
      await this.open();
    } catch (e) {
      this.update({ error: (e as Error).message });
    }
    return this.state;
  }

  disconnect() {
    this.key = null;
    secretFile.remove(this.file);
    this.update({ connected: false, user: null, teams: [], error: null });
    return this.state;
  }

  /** Each capture uploaded to Linear's storage (a signed URL, then a PUT): its asset URL, or '' when it failed. */
  async uploadImages(images: { name: string; dataUrl: string }[]): Promise<string[]> {
    return Promise.all(
      images.slice(0, 20).map(async ({ name, dataUrl }) => {
        const file = decodeDataUrl(dataUrl);
        if (!file) return '';
        const d = await this.gql<{ fileUpload: { success: boolean; uploadFile: { uploadUrl: string; assetUrl: string; headers: { key: string; value: string }[] } | null } }>(
          'mutation($contentType: String!, $filename: String!, $size: Int!) { fileUpload(contentType: $contentType, filename: $filename, size: $size) { success uploadFile { uploadUrl assetUrl headers { key value } } } }',
          { contentType: file.type, filename: name, size: file.bytes.length },
        );
        const up = d.fileUpload.uploadFile;
        if (!d.fileUpload.success || !up) return '';
        const headers: Record<string, string> = { 'content-type': file.type, 'cache-control': 'public, max-age=31536000' };
        for (const h of up.headers) headers[h.key] = h.value;
        const put = await fetch(up.uploadUrl, { method: 'PUT', headers, body: new Uint8Array(file.bytes), signal: AbortSignal.timeout(30_000) }).catch(() => null);
        return put?.ok ? up.assetUrl : '';
      }),
    );
  }

  async createIssue(teamId: string, title: string, description: string): Promise<string> {
    if (!this.state.teams.some((x) => x.id === teamId)) {
      await this.refresh();
      if (!this.state.teams.some((x) => x.id === teamId)) throw new Error(t('This Linear team no longer exists, or the key has no access to it: choose another one.', 'Cette équipe Linear n’existe plus, ou la clé n’y a pas accès : choisis-en une autre.'));
    }
    const d = await this.gql<{ issueCreate: { success: boolean; issue: { url: string } | null } }>('mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { url } } }', { input: { teamId, title, description } });
    if (!d.issueCreate.success || !d.issueCreate.issue) throw new Error(t('Linear did not create the issue.', 'Linear n’a pas créé l’issue.'));
    return d.issueCreate.issue.url;
  }
}
