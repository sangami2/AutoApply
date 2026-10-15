import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(root, 'config', 'official-leads.json');

export function htmlToText(raw) {
  let value = String(raw || '');
  for (let index = 0; index < 2; index++) {
    value = value.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
      .replace(/&#(?:39|x27);/gi, "'").replace(/&nbsp;/gi, ' ')
      .replace(/&(?:mdash|ndash);/gi, '–').replace(/&amp;/gi, '&');
  }
  return value.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(?:p|li|div|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

export async function fetchOfficialLeads({ fetchImpl = fetch, selected = null } = {}) {
  const configured = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : [];
  const leads = [];
  for (const item of configured) {
    if (!/^[a-z0-9-]+$/i.test(item.board) || !String(item.company || '').trim()
      || (item.provider === 'ashby' ? !/^[0-9a-f-]{36}$/i.test(item.jobId) : !Number.isInteger(item.jobId))) {
      throw new Error('Invalid official lead configuration.');
    }
    if (selected && !selected(item)) continue;
    try {
      if (item.provider === 'ashby') {
        const api = `https://api.ashbyhq.com/posting-api/job-board/${item.board}`;
        const response = await fetchImpl(api, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const job = data.jobs?.find((entry) => entry.id === item.jobId && entry.isListed !== false);
        if (!job) { console.warn(`  Official lead closed: ${item.board}/${item.jobId}`); continue; }
        const url = new URL(job.jobUrl);
        if (url.hostname !== 'jobs.ashbyhq.com' || !url.pathname.endsWith(`/${item.jobId}`)) throw new Error('Unexpected official job response.');
        const pageResponse = await fetchImpl(job.jobUrl, { signal: AbortSignal.timeout(15_000) });
        if (!pageResponse.ok) throw new Error(`Posting HTTP ${pageResponse.status}`);
        const page = await pageResponse.text();
        const compensation = page.match(/"compensationTierSummary":"([^"]+)"/)?.[1] || '';
        const postedBase = compensation.match(/\$[\d,]+\s*[kK]?\s*[-–—]\s*\$[\d,]+\s*[kK]?/)?.[0] || '';
        const description = `${job.descriptionPlain || htmlToText(job.descriptionHtml)}${postedBase ? `\nPosted base salary range: ${postedBase}.` : ''}`;
        leads.push({ source: 'ashby', sourceJobId: job.id, title: job.title, company: item.company,
          location: job.location || '', workModel: job.workplaceType || '', link: '',
          applicationUrl: job.applyUrl || job.jobUrl, description, officialSourceUrl: job.jobUrl,
          officialUpdatedAt: job.publishedAt || '', curatedFitSummary: item.fitSummary || '', pinnedPick: Boolean(item.pinToTop) });
        continue;
      }
      const api = `https://boards-api.greenhouse.io/v1/boards/${item.board}/jobs/${item.jobId}?content=true`;
      const response = await fetchImpl(api, { signal: AbortSignal.timeout(15_000) });
      if (response.status === 404) {
        console.warn(`  Official lead closed: ${item.board}/${item.jobId}`);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const url = new URL(data.absolute_url);
      if (url.hostname !== 'job-boards.greenhouse.io' || Number(data.id) !== item.jobId) throw new Error('Unexpected official job response.');
      leads.push({
        source: 'greenhouse', sourceJobId: String(data.id), title: data.title,
        company: item.company, location: data.location?.name || '',
        workModel: /remote/i.test(data.location?.name || '') ? 'Remote' : 'On-site',
        link: '', applicationUrl: data.absolute_url, description: htmlToText(data.content),
        officialSourceUrl: data.absolute_url, officialUpdatedAt: data.updated_at || '',
        curatedFitSummary: item.fitSummary || '', pinnedPick: Boolean(item.pinToTop),
      });
    } catch (error) {
      console.warn(`  Could not verify official lead ${item.board}/${item.jobId}: ${error.message}`);
    }
  }
  return leads;
}
