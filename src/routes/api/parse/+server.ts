import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { DEFAULT_SYSTEM_PROMPT } from '$lib/agent-prompt';

function getSystemPrompt(): string {
	const promptFile = resolve('agent-prompt.md');
	if (existsSync(promptFile)) {
		return readFileSync(promptFile, 'utf-8');
	}
	return DEFAULT_SYSTEM_PROMPT;
}

const _UNUSED_PROMPT = `Você é um parser de documentos de gestão de projetos IT Valley (Agente 08-b).

Receba um documento Markdown no formato do Agente 08-b e extraia a estrutura completa.

Mapeie os status dos emojis:
- ⬜ → "todo"
- 🔨 → "in_progress"
- ✅ → "done"
- 🔴 → "blocked"
- ⏳ → "review"
- Se não tem emoji ou diz "Não iniciado" → "todo"
- Se diz "mock" ou "✅ mock" → "done"

Retorne APENAS um JSON válido com esta estrutura exata (sem markdown, sem texto antes/depois):

{
  "projectName": "Nome do Projeto",
  "levels": [
    {
      "level": 1,
      "name": "Nível 1 — Base (sem dependências)",
      "domains": [
        {
          "name": "NomeDominio",
          "totalFeatures": 4,
          "dependsOn": [],
          "devFeatures": [
            {
              "name": "NomeDevFeature",
              "description": "Descrição curta com endpoint se houver",
              "dependsOn": [],
              "statusBack": "todo",
              "statusFront": "todo",
              "statusQA": "todo"
            }
          ]
        }
      ]
    }
  ]
}

REGRAS:
1. Extraia TODOS os domínios e TODAS as dev features — nenhuma pode ficar de fora
2. Mantenha a ordem original do documento
3. Se uma dev feature tem "✅ mock ⬜ real", considere statusBack como "done" (o mock está feito)
4. O campo description deve incluir o endpoint HTTP se mencionado (ex: "POST /api/products — cadastra produto")
5. Agrupe corretamente por nível conforme o documento define`;

function extractJson(content: string): string {
	let jsonStr = content;
	const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (jsonMatch) {
		jsonStr = jsonMatch[1];
	} else {
		const start = content.indexOf('{');
		const end = content.lastIndexOf('}');
		if (start !== -1 && end !== -1) {
			jsonStr = content.substring(start, end + 1);
		}
	}
	return jsonStr.trim();
}

async function callAnthropic(apiKey: string, markdown: string, systemPrompt: string, continuationContent?: string): Promise<{ text: string; stopReason: string }> {
	const messages: Array<{ role: string; content: string }> = [
		{ role: 'user', content: `Parse este documento de gestão de projeto 08-b e retorne o JSON estruturado:\n\n${markdown}` }
	];

	if (continuationContent) {
		messages.push({ role: 'assistant', content: continuationContent });
		messages.push({ role: 'user', content: 'Continue exatamente de onde parou. Retorne APENAS a continuação do JSON, sem repetir o que já foi enviado.' });
	}

	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: 'claude-opus-4-20250514',
			max_tokens: 16384,
			messages,
			system: systemPrompt
		})
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Anthropic API error: ${res.status} ${text}`);
	}

	const data = await res.json();
	return {
		text: data.content[0].text,
		stopReason: data.stop_reason
	};
}

export const POST: RequestHandler = async ({ request }) => {
	const apiKey = env.ANTHROPIC_API_KEY;
	if (!apiKey) return json({ ok: false, error: 'No Anthropic API key configured' }, { status: 400 });

	const { markdown } = await request.json();
	if (!markdown) return json({ ok: false, error: 'No markdown provided' }, { status: 400 });

	try {
		const systemPrompt = getSystemPrompt();
		let result = await callAnthropic(apiKey, markdown, systemPrompt);
		let fullContent = result.text;

		// If response was truncated, request continuation (up to 2 retries)
		let retries = 0;
		while (result.stopReason === 'max_tokens' && retries < 2) {
			retries++;
			result = await callAnthropic(apiKey, markdown, systemPrompt, fullContent);
			fullContent += result.text;
		}

		const jsonStr = extractJson(fullContent);
		const parsed = JSON.parse(jsonStr);
		return json({ ok: true, data: parsed });
	} catch (e: any) {
		return json({ ok: false, error: e.message }, { status: 500 });
	}
};
