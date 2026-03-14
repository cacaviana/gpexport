import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const SYSTEM_PROMPT = `Você é um parser de documentos de gestão de projetos IT Valley (Agente 08-b).

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

export const POST: RequestHandler = async ({ request }) => {
	const apiKey = env.ANTHROPIC_API_KEY;
	if (!apiKey) return json({ ok: false, error: 'No Anthropic API key configured' }, { status: 400 });

	const { markdown } = await request.json();
	if (!markdown) return json({ ok: false, error: 'No markdown provided' }, { status: 400 });

	try {
		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: 'claude-opus-4-20250514',
				max_tokens: 8192,
				messages: [
					{ role: 'user', content: `Parse este documento de gestão de projeto 08-b e retorne o JSON estruturado:\n\n${markdown}` }
				],
				system: SYSTEM_PROMPT
			})
		});

		if (!res.ok) {
			const text = await res.text();
			return json({ ok: false, error: `Anthropic API error: ${res.status} ${text}` }, { status: res.status });
		}

		const data = await res.json();
		const content = data.content[0].text;

		// Extract JSON from response (handle if wrapped in markdown code blocks)
		let jsonStr = content;
		const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (jsonMatch) jsonStr = jsonMatch[1];

		const parsed = JSON.parse(jsonStr.trim());
		return json({ ok: true, data: parsed });
	} catch (e: any) {
		return json({ ok: false, error: e.message }, { status: 500 });
	}
};
