import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const CLICKUP_BASE = 'https://api.clickup.com/api/v2';

async function clickupFetch(path: string, method: string = 'GET', body?: any) {
	const token = env.CLICKUP_API_TOKEN;
	const res = await fetch(`${CLICKUP_BASE}${path}`, {
		method,
		headers: {
			Authorization: token!,
			'Content-Type': 'application/json'
		},
		body: body ? JSON.stringify(body) : undefined
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`ClickUp ${method} ${path}: ${res.status} ${text}`);
	}
	return res.json();
}

const CUSTOM_STATUSES = [
	{ status: 'A FAZER', color: '#87909e', orderindex: 0, type: 'open' },
	{ status: 'FEITO IA', color: '#a855f7', orderindex: 1, type: 'custom' },
	{ status: 'REVISÃO DEV', color: '#f59e0b', orderindex: 2, type: 'custom' },
	{ status: 'FEITO DEV', color: '#3b82f6', orderindex: 3, type: 'custom' },
	{ status: 'QA', color: '#f97316', orderindex: 4, type: 'custom' },
	{ status: 'FINALIZADA', color: '#22c55e', orderindex: 5, type: 'closed' }
];

function humanize(camelCase: string): string {
	return camelCase.replace(/([A-Z])/g, ' $1').trim();
}

function mapStatus(backStatus: string): string {
	return backStatus === 'done' ? 'feito ia' : 'a fazer';
}

/*
 * Hierarquia PMBOK/EAP → ClickUp:
 *   Space  = Escopo gerenciável (ex: "Sistemas IT Valley")
 *   Folder = Projeto (ex: "TCC — Traffic Command Center")
 *   List   = Entregável/Domínio (ex: "Domínio Produto")
 *   Task   = Ação/Dev Feature (ex: "Criar Produto (CriarProdutoRequest)")
 *
 * Status por List: A FAZER → FEITO IA → REVISÃO DEV → FEITO DEV → QA → FINALIZADA
 */
export const POST: RequestHandler = async ({ request }) => {
	const token = env.CLICKUP_API_TOKEN;
	const teamId = env.CLICKUP_TEAM_ID;
	if (!token) return json({ ok: false, error: 'No ClickUp API token' }, { status: 400 });
	if (!teamId) return json({ ok: false, error: 'No Team ID configured' }, { status: 400 });

	const { data, spaceId: existingSpaceId, spaceName: customSpaceName, folderName: customFolderName } = await request.json();
	if (!data?.projectName || !data?.levels) {
		return json({ ok: false, error: 'Invalid data structure' }, { status: 400 });
	}

	const log: string[] = [];
	try {
		// 1. Space (escopo) — criar novo ou reusar existente
		let spaceId: string;
		if (existingSpaceId) {
			spaceId = existingSpaceId;
			log.push(`📌 Usando Space existente (id: ${spaceId})`);
		} else {
			const spaceName = customSpaceName || 'Sistemas IT Valley';
			const space = await clickupFetch(`/team/${teamId}/space`, 'POST', {
				name: spaceName,
				multiple_assignees: true,
				features: { due_dates: { enabled: true }, checklists: { enabled: true }, tags: { enabled: true } }
			});
			spaceId = space.id;
			log.push(`✅ Space "${spaceName}" criado`);
		}

		// 2. Folder (projeto)
		const projectName = customFolderName || data.projectName;
		const folder = await clickupFetch(`/space/${spaceId}/folder`, 'POST', { name: projectName });
		const folderId = folder.id;
		log.push(`📁 Projeto "${projectName}" criado`);

		// 3. Tags de nível
		const tagColors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626'];
		for (const level of data.levels) {
			const tagName = `Nível ${level.level}`;
			try {
				await clickupFetch(`/space/${spaceId}/tag`, 'POST', {
					tag: { name: tagName, tag_bg: tagColors[level.level - 1] || '#6b7280', tag_fg: '#ffffff' }
				});
			} catch {
				// Tag may already exist
			}
		}

		// 4. Para cada domínio: List (entregável) → Tasks (ações)
		let totalTasks = 0;
		for (const level of data.levels) {
			for (const domain of level.domains) {
				const features = domain.devFeatures || [];
				const lv = level.level;

				// Criar List = "Domínio {nome}"
				const listDesc = [
					domain.domainDescription || '',
					domain.dependsOn?.length ? `\n🔗 Depende de: ${domain.dependsOn.join(', ')}` : '',
					`\n🏷️ ${level.name}`
				].filter(Boolean).join('');

				const list = await clickupFetch(`/folder/${folderId}/list`, 'POST', {
					name: `Domínio ${domain.name}`,
					content: listDesc
				});
				const listId = list.id;

				// Setar status customizados na List
				await clickupFetch(`/list/${listId}`, 'PUT', {
					override_statuses: true,
					statuses: CUSTOM_STATUSES
				});

				log.push(`📋 Domínio ${domain.name} (${features.length} tarefas)`);

				// Criar Tasks
				for (const feat of features) {
					const human = humanize(feat.name);
					const dto = `${feat.name}Request`;
					const taskName = `${human} (${dto})`;
					const status = mapStatus(feat.statusBack || 'todo');

					const descParts: string[] = [];
					if (feat.description) descParts.push(feat.description);
					if (feat.acceptance) descParts.push(`\n✅ Critérios de Aceite:\n${feat.acceptance}`);
					descParts.push(`\n---`);
					descParts.push(`📦 DTO: ${dto}`);
					descParts.push(`🏷️ Nível ${lv} — ${level.name}`);
					descParts.push(`📋 Domínio ${domain.name}`);
					if (domain.dependsOn?.length) {
						descParts.push(`🔗 Domínio depende de: ${domain.dependsOn.join(', ')}`);
					}
					if (feat.dependsOn?.length) {
						const deps = feat.dependsOn.map((d: string) => `${humanize(d)} (${d}Request)`);
						descParts.push(`⛓️ Depende de: ${deps.join(', ')}`);
					}

					const task = await clickupFetch(`/list/${listId}/task`, 'POST', {
						name: taskName,
						description: descParts.join('\n'),
						status,
						tags: [`Nível ${lv}`]
					});

					// Checklist Camadas (Back/Front/QA)
					const checklist = await clickupFetch(`/task/${task.id}/checklist`, 'POST', { name: 'Camadas' });
					for (const [layerName, layerStatus] of [
						['Back', feat.statusBack],
						['Front', feat.statusFront],
						['QA', feat.statusQA]
					]) {
						await clickupFetch(`/checklist/${checklist.checklist.id}/checklist_item`, 'POST', {
							name: layerName,
							resolved: layerStatus === 'done'
						});
					}

					const emoji = status === 'feito ia' ? '🟣' : '⬜';
					log.push(`   ${emoji} ${taskName}`);
					totalTasks++;
				}
			}
		}

		log.push('');
		log.push(`🎉 ${totalTasks} tarefas criadas!`);
		log.push(`Status: A FAZER → FEITO IA → REVISÃO DEV → FEITO DEV → QA → FINALIZADA`);

		return json({ ok: true, log });
	} catch (e: any) {
		log.push(`❌ Erro: ${e.message}`);
		return json({ ok: false, error: e.message, log }, { status: 500 });
	}
};
