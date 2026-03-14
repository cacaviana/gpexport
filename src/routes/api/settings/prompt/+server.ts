import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const PROMPT_FILE = resolve('agent-prompt.md');

export const GET: RequestHandler = async () => {
	if (existsSync(PROMPT_FILE)) {
		return json({ prompt: readFileSync(PROMPT_FILE, 'utf-8') });
	}
	// Return default prompt
	const { DEFAULT_SYSTEM_PROMPT } = await import('$lib/agent-prompt');
	return json({ prompt: DEFAULT_SYSTEM_PROMPT });
};

export const POST: RequestHandler = async ({ request }) => {
	const { prompt } = await request.json();
	writeFileSync(PROMPT_FILE, prompt, 'utf-8');
	return json({ ok: true });
};
