import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { DEFAULT_SYSTEM_PROMPT } from '$lib/agent-prompt';

export const GET: RequestHandler = async () => {
	const promptFile = resolve('agent-prompt.md');
	let agentPrompt = DEFAULT_SYSTEM_PROMPT;
	if (existsSync(promptFile)) {
		agentPrompt = readFileSync(promptFile, 'utf-8');
	}

	return json({
		clickupToken: env.CLICKUP_API_TOKEN ? '••••' + env.CLICKUP_API_TOKEN.slice(-8) : '',
		anthropicKey: env.ANTHROPIC_API_KEY ? '••••' + env.ANTHROPIC_API_KEY.slice(-8) : '',
		teamId: env.CLICKUP_TEAM_ID || '',
		hasClickup: !!env.CLICKUP_API_TOKEN,
		hasAnthropic: !!env.ANTHROPIC_API_KEY,
		agentPrompt
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const envPath = resolve('.env');
	let envContent = '';
	try {
		envContent = readFileSync(envPath, 'utf-8');
	} catch {
		envContent = '';
	}

	const updates: Record<string, string> = {};
	if (body.clickupToken) updates['CLICKUP_API_TOKEN'] = body.clickupToken;
	if (body.anthropicKey) updates['ANTHROPIC_API_KEY'] = body.anthropicKey;
	if (body.teamId) updates['CLICKUP_TEAM_ID'] = body.teamId;

	for (const [key, value] of Object.entries(updates)) {
		const regex = new RegExp(`^${key}=.*$`, 'm');
		if (regex.test(envContent)) {
			envContent = envContent.replace(regex, `${key}=${value}`);
		} else {
			envContent += `\n${key}=${value}`;
		}
	}

	writeFileSync(envPath, envContent.trim() + '\n');
	return json({ ok: true, message: 'Settings saved. Restart server to apply.' });
};
