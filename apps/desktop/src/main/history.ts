import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HistoryEntry } from '../shared/types';

const MAX = 200;

/** Score, Web Vitals and weight of each deployment measured, one JSON file per project. */
export class HistoryStore {
  constructor(private dir: string) {}

  private file(projectId: string) {
    return join(this.dir, `${projectId.replace(/[^\w.-]+/g, '_')}.json`);
  }

  load(projectId: string): HistoryEntry[] {
    try {
      return JSON.parse(readFileSync(this.file(projectId), 'utf8')) as HistoryEntry[];
    } catch {
      return [];
    }
  }

  /** Newest last. A deployment measured again replaces its previous entry. */
  add(projectId: string, entry: HistoryEntry): HistoryEntry[] {
    const list = this.load(projectId).filter((e) => !(entry.deploymentId && e.deploymentId === entry.deploymentId && e.url === entry.url));
    list.push(entry);
    list.sort((a, b) => a.at - b.at);
    const kept = list.slice(-MAX);
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file(projectId), JSON.stringify(kept));
    return kept;
  }
}
